import * as XLSX from 'xlsx';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()} ${response.url()}`); });
await mkdir('artifacts', { recursive: true });
const action = (name, root = page) => root.locator(`[data-action="${name}"]`).first();
const dialog = () => page.locator('#app');
const noModal = async () => { await count('[role=dialog]', 0); assert.equal(await page.locator('#app').evaluate(element => element.inert), false); };
const selectCT15 = async () => { for (const id of ['d1', 'd2', 'd3']) await page.locator(`[data-device-check="${id}"]`).check(); };
function workbookBuffer(model = 'CT15') {
    const book = XLSX.utils.book_new();
    const rows = [['设备名称', '时间服务器地址', '网关地址', '厂商名称'],
        [`C${model.slice(2)}KH2661500000${model === 'CT13' ? '201' : '101'}`, 'time.example.org', '192.0.2.254', 'OpenValley']];
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), '系统参数');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['设备名称']]), '用户参数');
    return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}
const importConfig = async () => page.locator('#operation-file').setInputFiles({ name: 'CT15_标准参数.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbookBuffer() });
const otaFile = async () => page.locator('#operation-file').setInputFiles({ name: 'CT15_OTA_V2.13.00.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('mock firmware') });
const count = async (selector, expected) => assert.equal(await page.locator(selector).count(), expected);
const textIncludes = async (locator, text) => {
    await locator.filter({ hasText: text }).waitFor({ state: 'visible' });
    assert.ok((await locator.innerText()).includes(text), `Expected ${text}`);
};
try {
    await page.clock.install();
    await page.goto(`${baseURL}?scenario=failure`);
    await count('.device-table tbody tr', 7);
    assert.ok(!/原型|演示|示例|设计说明|CONTROLLER WORKSPACE/.test(await page.locator('#app').innerText()), 'Review-only content leaked into product UI');
    await page.locator('#device-search').fill('CT16');
    await count('.device-table tbody tr', 1);
    await page.locator('#device-search').fill('');
    await count('[data-action="manual-add"]', 0);
    await count('.stat-grid', 0);
    await textIncludes(page.locator('.table-footer'), '已连接');
    await count('[data-action="transport"]', 2);
    await page.locator('[data-action="transport"][data-value="MQTT"]').click();
    await count('.device-table tbody tr', 1);
    await page.locator('[data-action="transport"][data-value="LAN"]').click();
    await page.locator('#search-start-octet-2').fill('18');
    await page.locator('#search-start-octet-3').fill('100');
    await page.locator('#search-end-octet-2').fill('18');
    await page.locator('#search-end-octet-3').fill('50');
    await action('discover').click();
    await textIncludes(page.locator('#search-range-error'), '结束地址不能小于');
    await page.locator('#search-start-octet-0').fill('999');
    await action('discover').click();
    await textIncludes(page.locator('#search-range-error'), '有效的起始');
    await page.locator('#search-start-octet-0').fill('192');
    await page.locator('#search-start-octet-2').fill('18');
    await page.locator('#search-start-octet-3').fill('1');
    await page.locator('#search-end-octet-2').fill('19');
    await page.locator('#search-end-octet-3').fill('254');
    await page.screenshot({ path: 'artifacts/07-search-range.png', fullPage: true });
    await action('discover').click();
    await textIncludes(page.locator('.discovery-actions'), '搜索中');
    await page.clock.runFor(1200);
    await textIncludes(page.locator('#toast-root'), '搜索完成');
    assert.equal(await page.locator('#search-start-octet-2').inputValue(), '18');
    assert.equal(await page.locator('#search-end-octet-2').inputValue(), '19');
    await selectCT15();
    await count('[data-device-check]:checked', 3);
    await page.screenshot({ path: 'artifacts/01-workspace.png', fullPage: true });

    // 批量导入、文件预览、失败演示，以及跨页面持续执行。
    await page.locator('[data-action="work-tab"][data-kind="import"]').click();
    await noModal();
    await action('operation-submit').click();
    await textIncludes(dialog(), '请选择配置文件');
    await importConfig();
    await page.locator('#safety-backup').check();
    await textIncludes(dialog(), '将写入的值');
    await page.clock.runFor(250);
    await page.screenshot({ path: 'artifacts/02-import-preview.png', fullPage: true });
    await action('operation-submit', dialog()).click();
    await textIncludes(dialog(), '逐台执行结果');
    await noModal();
    await count('#results-dock .task-device', 3);
    if (await action('clear-selection').isEnabled()) await action('clear-selection').click();
    await count('#results-dock .task-device', 3); // 执行目标是快照，不随当前选择改变。
    await page.locator('[data-action="work-tab"][data-kind="configure"]').click();
    await page.locator('[data-config-check="sntpAddr"]').check();
    await page.locator('[data-config-value="sntpAddr"]').fill('editing.example.org');
    await page.clock.runFor(1500);
    assert.equal(await page.locator('[data-config-value="sntpAddr"]').inputValue(), 'editing.example.org');
    assert.equal(await page.locator('[data-config-value="sntpAddr"]').evaluate(element => element === document.activeElement), true);
    await page.locator('#results-dock summary').first().click();
    await page.clock.runFor(1500);
    assert.equal(await page.locator('#results-dock details').first().getAttribute('open'), '');
    await page.locator('.nav-item[data-page="burn"]').click();
    await page.clock.runFor(23000);
    await page.locator('.nav-item[data-page="tasks"]').click();
    await action('task-detail').first().click();
    await textIncludes(dialog(), '通信超时');
    await page.clock.runFor(250);
    await page.screenshot({ path: 'artifacts/03-task-results.png', fullPage: true });
    await action('retry-task', dialog()).click();
    await count('#results-dock .task-device', 1);
    await noModal();
    await page.clock.runFor(12000);
    await textIncludes(dialog(), '已完成');

    // 不支持能力明确提示，不静默执行 CT16 的 OTA。
    await page.locator('.nav-item[data-page="workspace"]').click();
    if (await action('clear-selection').isEnabled()) await action('clear-selection').click();
    await page.locator('[data-device-check="d4"]').check();
    await page.locator('[data-action="work-tab"][data-kind="ota"]').click();
    await textIncludes(dialog(), 'CT16 暂不支持OTA 升级');
    await otaFile();
    await action('operation-submit').click();
    await textIncludes(dialog(), '没有可执行的设备');

    // 沿用逐台固件检查，不在界面层一律禁止 CT13/CT15 组合。
    if (await action('clear-selection').isEnabled()) await action('clear-selection').click();
    await page.locator('[data-device-check="d1"]').check();
    await page.locator('[data-device-check="d5"]').check();
    await action('connect-selected').click();
    await page.locator('[data-action="work-tab"][data-kind="ota"]').click();
    await otaFile();
    await textIncludes(dialog(), '执行前检查');
    await page.locator('[data-target-toggle="d5"]').uncheck();
    await textIncludes(dialog(), '已排除');

    // 真实浏览器文件选择与逐台文件分配，包含非法文件输入。
    await page.locator('[data-action="work-tab"][data-kind="import"]').click();
    await page.locator('#operation-file').setInputFiles({ name: 'bad.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('{}') });
    await textIncludes(dialog(), '工作表');
    await page.locator('input[name="import-mode"][value="mapping"]').check();
    await page.locator('#operation-file').setInputFiles([
        { name: 'ct15.xlsx', mimeType: 'application/octet-stream', buffer: workbookBuffer('CT15') },
        { name: 'ct13.xlsx', mimeType: 'application/octet-stream', buffer: workbookBuffer('CT13') },
    ]);
    await page.locator('[data-map-device="d1"]').selectOption('ct15.xlsx');
    await page.locator('[data-map-device="d5"]').selectOption('ct13.xlsx');
    await page.clock.runFor(250);
    await page.screenshot({ path: 'artifacts/04-per-device-mapping.png', fullPage: true });
    await textIncludes(dialog(), 'ct13.xlsx');

    // 刷新目标列表后仍保留用户填写的参数，单项配置不丢值。
    await page.locator('[data-action="work-tab"][data-kind="configure"]').click();
    await page.locator('[data-config-check="sntpAddr"]').check();
    await page.locator('[data-config-value="sntpAddr"]').fill('time.example.org');
    await page.locator('[data-target-toggle="d5"]').uncheck();
    assert.equal(await page.locator('[data-config-value="sntpAddr"]').inputValue(), 'time.example.org');
    await textIncludes(dialog(), 'time.example.org');

    // CT16 详情能力限制，以及终端使用安全文本输出。
    await page.locator('[data-action="detail"][data-id="d4"]').first().click();
    await page.locator('[data-action="detail-tab"][data-value="params"]').click();
    await textIncludes(dialog(), 'CT16 暂不支持参数管理');
    await noModal();
    await page.keyboard.press('Escape');
    await page.locator('[data-action="detail"][data-id="d1"]').first().click();
    await page.locator('[data-action="detail-tab"][data-value="terminal"]').click();
    await page.locator('input[name="command"]').fill('<img src=x onerror=alert(1)>');
    await page.locator('input[name="command"]').press('Enter');
    await count('#terminal-output img', 0);
    await textIncludes(page.locator('#terminal-output'), '<img');
    await page.keyboard.press('Escape');

    // 固件烧录输入缺失提示与正常任务创建。
    await page.locator('.nav-item[data-page="burn"]').click();
    await page.locator('#burn-model').selectOption('CT11');
    await count('.part-button', 2);
    await textIncludes(page.locator('.burn-content'), 'J-Link');
    await page.locator('#burn-model').selectOption('CT15');
    await count('.part-button', 4);
    await textIncludes(page.locator('.burn-content'), 'HPM');
    await page.locator('[data-action="burn-part"][data-value="蓝牙"]').click();
    await textIncludes(page.locator('.burn-content'), 'ESP32-S3');
    await page.locator('#burn-model').selectOption('CT16');
    await page.locator('[data-action="burn-part"][data-value="主控"]').click();
    await action('burn-start').click();
    await textIncludes(page.locator('#toast-root'), '请先选择固件');
    await page.locator('#burn-file-input').setInputFiles({ name: 'ct16_main.img', mimeType: 'application/octet-stream', buffer: Buffer.from('mock firmware') });
    await action('burn-start').click();
    await textIncludes(dialog(), '固件烧录');
    await page.clock.runFor(12000);

    // LED 等待超过多轮模拟时间仍未通过，只有人工确认才继续。
    await page.goto(`${baseURL}?edition=factory`);
    await action('factory-start').click();
    await page.clock.runFor(30000);
    await textIncludes(dialog(), '等待人工确认');
    await page.clock.runFor(250);
    await page.screenshot({ path: 'artifacts/05-led-confirmation.png', fullPage: true });
    await action('led-pass', dialog()).click();
    await page.clock.runFor(6000);
    await textIncludes(dialog(), '已完成');
    // 方案导入校验真实 Qt 5.14 夹具，23 项配置与循环停止。
    await action('factory-settings').click();
    await count('input[name="factory-item"]', 23);
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.getByRole('dialog').evaluate(element => element.contains(document.activeElement)));
    await action('close-overlay', page.getByRole('dialog')).click();
    await action('factory-import').click();
    await page.locator('#factory-profile-file').setInputFiles('tests/qt514-profile.ctfp');
    await action('factory-profile-confirm').click();
    await textIncludes(page.locator('#factory-profile-name'), 'qt514-profile.ctfp');
    await count('.test-item-chips > span', 2);
    await page.locator('[data-action="factory-stage"][data-value="老化"]').click();
    await action('factory-start').click();
    await page.clock.runFor(35000);
    await count('[data-action="led-pass"]', 0);
    await action('factory-stop').click();
    await textIncludes(page.locator('#toast-root'), '测试已停止');
    await page.goto(`${baseURL}?edition=release`);
    await count('.nav-item[data-page="factory"]', 0);
    await count('.nav-item[data-page="developer"]', 0);
    assert.ok(await page.locator('[data-action="transport"][data-value="MQTT"]').isDisabled());
    await page.locator('.nav-item[data-page="settings"]').click();
    await count('#session-key', 1);
    await count('#remote-enabled', 0);
    await count('#task-concurrency', 0);
    await page.locator('.nav-item[data-page="workspace"]').click();

    // 主窗口分栏、非模态操作、页签输入保留和分隔条键盘调整。
    await page.setViewportSize({ width: 1280, height: 800 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Document overflow at desktop width');
    await page.screenshot({ path: 'artifacts/06-desktop-1280.png', fullPage: true });
    await selectCT15();
    await page.locator('[data-action="work-tab"][data-kind="import"]').click();
    await noModal();
    await importConfig();
    await page.locator('[data-action="work-tab"][data-kind="ota"]').click();
    await page.locator('[data-action="work-tab"][data-kind="import"]').click();
    await textIncludes(page.locator('#work-panel'), 'CT15_标准参数.xlsx');
    const initialWidth = await page.locator('.device-browser').evaluate(element => element.clientWidth);
    await page.locator('[data-split="devices"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.ok(await page.locator('.device-browser').evaluate(element => element.clientWidth) > initialWidth);
    await noModal();
    const initialHeight = await page.locator('#results-dock').evaluate(element => element.clientHeight);
    await page.locator('[data-split="results"]').focus();
    await page.keyboard.press('ArrowUp');
    assert.ok(await page.locator('#results-dock').evaluate(element => element.clientHeight) > initialHeight);
    await page.screenshot({ path: 'artifacts/08-inline-desktop.png', fullPage: true });
    await page.locator('[data-preview-edition="factory"]').click();
    await textIncludes(page.locator('.edition-label'), '工厂版');
    await count('.nav-item[data-page="factory"]', 1);
    await page.locator('[data-preview-edition="internal"]').click();
    await textIncludes(page.locator('.edition-label'), '内测版');
    await count('[data-action="transport"]', 2);
    await page.locator('[data-preview-edition="release"]').click();
    await textIncludes(page.locator('.edition-label'), '发行版');
    assert.deepEqual(errors, []);
    console.log('Browser regression passed: batch import, retry, capability checks, model checks, per-device files, terminal escaping, flashing, LED confirmation, edition navigation, inline desktop workflows, splitters, retained drafts and settings focus.');
} finally {
    await browser.close();
}
