import * as XLSX from 'xlsx';
import { readWorkbook } from '../src/core/workbook.js';
import { readFile } from 'node:fs/promises';
import { encodeFactoryProfile, decodeFactoryProfile } from '../src/core/factory-profile.js';
import { validateSearch, burnProfiles } from '../src/core/catalog.js';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { state, demoDevices, availability, escapeHtml } from '../src/core/store.js';
import { createTask, tickTasks, taskStatus, retryFailed, cancelQueued, confirmLed } from '../src/core/tasks.js';
import { beginOperation, operation, validateOperation } from '../src/views/operations.js';

beforeEach(() => {
    state.edition = 'internal';
    state.devices = structuredClone(demoDevices);
    state.devices[7].occupied = true;
    state.flashTargets = [];
    state.tasks = [];
    state.maxConcurrent = 2;
});
test('执行前区分不支持、未连接和离线设备', () => {
    assert.match(availability(state.devices[3], 'ota'), /暂不支持/);
    assert.match(availability(state.devices[4], 'import'), /尚未连接/);
    assert.match(availability(state.devices[5], 'import'), /离线/);
    assert.throws(() => createTask('ota', ['d4']), /暂不支持/);
    assert.throws(() => createTask('import', []), /至少/);
});
test('同一设备的任务互斥，输入快照不受后续编辑影响', () => {
    const options = { values: { reportInterval: '30' } };
    const task = createTask('configure', ['d1', 'd1'], options);
    options.values.reportInterval = '99';
    assert.equal(task.items.length, 1);
    assert.equal(task.options.values.reportInterval, '30');
    assert.throws(() => createTask('reboot', ['d1']), /正在执行/);
});
test('并发上限和取消只影响排队项，运行项继续', () => {
    const task = createTask('reboot', ['d1', 'd2', 'd3']);
    tickTasks();
    assert.equal(task.items.filter(item => item.status === 'running').length, 2);
    cancelQueued(task);
    assert.equal(task.items[2].status, 'cancelled');
    for (let index = 0; index < 20; index++) tickTasks();
    assert.equal(task.items[0].status, 'success');
    assert.equal(task.items[1].status, 'success');
    assert.equal(task.items[2].status, 'cancelled');
});
test('部分失败只重试失败设备，不重复执行成功项', () => {
    const original = createTask('import', ['d1', 'd2'], { demoFailure: true });
    for (let index = 0; index < 20; index++) tickTasks();
    assert.equal(taskStatus(original), 'failed');
    const retried = retryFailed(original);
    assert.deepEqual(retried.items.map(item => item.deviceId), ['d2']);
    assert.equal(retried.options.retryOf, original.id);
    for (let index = 0; index < 20; index++) tickTasks();
    assert.equal(taskStatus(retried), 'success');
    assert.equal(original.items[0].status, 'success');
});
test('PCBA/整机 LED 必须人工确认，等待不会自动通过', () => {
    for (const stage of ['PCBA', '整机']) {
        state.tasks = [];
        const task = createTask('factory', ['d4'], { stage });
        for (let index = 0; index < 100; index++) tickTasks();
        assert.equal(task.items[0].status, 'waiting');
        confirmLed(task, 'd4', stage === 'PCBA');
        for (let index = 0; index < 20; index++) tickTasks();
        assert.equal(task.items[0].status, stage === 'PCBA' ? 'success' : 'failed');
    }
});
test('老化循环运行，不等待 LED 人工确认', () => {
    const task = createTask('factory', ['d4'], { stage: '老化' });
    for (let index = 0; index < 20; index++) tickTasks();
    assert.equal(taskStatus(task), 'running');
    assert.ok(task.items[0].cycles >= 1);
});
test('Excel 配置沿用工作表与 SN 行结构，跳过 MAC 地址', () => {
    globalThis.window = { XLSX };
    const book = XLSX.utils.book_new();
    const bytes = () => XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['设备名称', '时间服务器地址', 'MAC地址'], ['SN-1', 'time.example.org', '00:11:22:33:44:55']]), '系统参数');
    assert.throws(() => readWorkbook(bytes()), /工作表/);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['设备名称']]), '用户参数');
    const actual = readWorkbook(bytes());
    assert.equal(actual['系统参数'][0].sn, 'SN-1');
    assert.deepEqual(actual['系统参数'][0].parameters, [{ key: 'sntpAddr', label: '时间服务器地址', value: 'time.example.org' }]);
});
test('Excel 逐台分配必须存在目标 SN 行，不依赖虚构的型号字段', () => {
    state.devices[4].connected = true;
    beginOperation('import', ['d1', 'd5']);
    operation.config = { parameters: [{ key: 'sntpAddr', value: 'time.example.org' }] };
    operation.mode = 'mapping';
    assert.match(validateOperation(), /每台/);
    operation.files = [{ name: 'config.xlsx', config: operation.config, workbook: { 系统参数: [{ sn: state.devices[0].sn, parameters: operation.config.parameters }] } }];
    operation.mappings = { d1: 'config.xlsx', d5: 'config.xlsx' };
    assert.match(validateOperation(), /SN/);
    operation.files[0].workbook.系统参数.push({ sn: state.devices[4].sn, parameters: operation.config.parameters });
    assert.equal(validateOperation(), '');
});
test('OTA 保留逐台检查，不预先禁止 CT13/CT15 组合', () => {
    state.devices[4].connected = true;
    beginOperation('ota', ['d1', 'd5']);
    operation.files = [{ name: 'demo.bin' }];
    operation.firmwareModel = 'CT15';
    assert.equal(validateOperation(), '');
    operation.skipped.add('d5');
    assert.equal(validateOperation(), '');
});
test('外部名称输出经过 HTML 转义', () => {
    assert.equal(escapeHtml('<img onerror="x">&'), '&lt;img onerror=&quot;x&quot;&gt;&amp;');
});

test('搜索起止 IP 后两段独立编辑，按完整 IPv4 数值比较', () => {
    assert.equal(validateSearch('192.168.18.1', '192.168.19.254'), '');
    assert.equal(validateSearch('192.168.18.200', '192.168.19.1'), '');
    assert.equal(validateSearch('192.168.18.10', '192.168.18.10'), '');
    for (const ip of ['999.0.0.1', '192.0.2', '', '192.168.1.1.2', '192.168.-1.1']) {
        assert.match(validateSearch(ip, '192.168.19.254'), /起始 IPv4/);
        assert.match(validateSearch('192.168.18.1', ip), /结束 IPv4/);
    }
    assert.match(validateSearch('192.168.19.1', '192.168.18.254'), /不能小于/);
    assert.match(validateSearch('192.168.18.200', '192.168.18.10'), /不能小于/);
});
test('型号烧录能力严格对应 FirmwareBurnProfile', () => {
    assert.deepEqual(burnProfiles.CT11.map(part => part.label), ['主控', '蓝牙']);
    assert.equal(burnProfiles.CT15[0].backend, 'HPM');
    assert.equal(burnProfiles.CT15.find(part => part.label === '蓝牙').backend, 'ESP32-S3');
    assert.deepEqual(burnProfiles.CT16.map(part => part.label), ['主控', '子板', '蓝牙/星闪', 'WiFi']);
});

test('CTFP 读取 Qt 5.14 QDataStream 独立夹具并拒绝篡改', async () => {
    const bytes = new Uint8Array(await readFile(new URL('./qt514-profile.ctfp', import.meta.url)));
    const profile = await decodeFactoryProfile(bytes);
    assert.equal(profile.batchDate, '202611051230');
    assert.deepEqual(profile.stages.PCBA, ['eMMC', 'LED']);
    assert.equal(profile.params.subModules, '1,23');
    assert.deepEqual(await decodeFactoryProfile(await encodeFactoryProfile(profile)), profile);
    bytes[40] ^= 1;
    await assert.rejects(decodeFactoryProfile(bytes), /无效/);
    await assert.rejects(decodeFactoryProfile(new Uint8Array([1, 2, 3])), /无效/);
    await assert.rejects(encodeFactoryProfile({ ...profile, batchDate: '202602301230' }), /无效/);
    await assert.rejects(encodeFactoryProfile({ ...profile, params: { ...profile.params, bluetooth: '中'.repeat(22) } }), /无效/);
});
test('工厂版不开放发行配置与文件管理', () => {
    state.edition = 'factory';
    assert.match(availability(state.devices[0], 'export'), /不支持/);
    assert.match(availability(state.devices[0], 'files'), /不支持/);
    assert.match(availability(state.devices[7], 'reboot'), /占用/);
});
