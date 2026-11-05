import { encodeFactoryProfile, decodeFactoryProfile } from './core/factory-profile.js';
import { validateSearch, systemParameters, factoryItems } from './core/catalog.js';
import { readWorkbook, writeWorkbook } from './core/workbook.js';
import { state, getDevice, visibleDevices, escapeHtml as e } from './core/store.js';
import { createTask, tickTasks, retryFailed, cancelQueued, confirmLed, taskStatus } from './core/tasks.js';
import { icon, button, download } from './ui.js';
import { workspace } from './views/workspace.js';
import { operation, beginOperation, operationPreview, eligible, validateOperation } from './views/operations.js';
import { tasksPage, taskPanel, burnPage, factoryPage, settingsPage } from './views/pages.js';

state.workTab = 'device';
state.resultId = '';
const operationDrafts = new Map();
let overlay = null;
let previousFocus = null;
let modalDraft = {};
let toastTimer;
let searchTimer;
const app = document.querySelector('#app');
const overlayRoot = document.querySelector('#overlay-root');
const navItems = [['workspace', '设备工作台', 'devices'], ['tasks', '任务中心', 'tasks'], ['burn', '固件烧录', 'burn'], ['factory', '生产测试', 'factory']];
const editions = { internal: '内测版', release: '发行版', factory: '工厂版' };
function allowedPage(page) { return !(state.edition !== 'factory' && page === 'factory'); }
function shell() {
    const active = state.tasks.filter(task => ['running', 'waiting'].includes(taskStatus(task))).length;
    return `<aside class="sidebar"><div class="brand"><span class="brand-mark">${icon('chip', 24)}</span><span>CCTools</span></div>
    <div class="edition-label">${editions[state.edition]}</div><nav aria-label="主导航">${navItems.filter(([id]) => allowedPage(id)).map(([id, label, glyph]) => `<button data-action="navigate" data-page="${id}" class="nav-item ${state.page === id ? 'active' : ''}">${icon(glyph, 19)}<span>${label}</span>${id === 'tasks' && active ? `<b>${active}</b>` : ''}</button>`).join('')}</nav>
    <div class="sidebar-bottom"><button class="nav-item ${state.page === 'settings' ? 'active' : ''}" data-action="navigate" data-page="settings">${icon('settings', 19)}<span>设置</span></button></div></aside>
    <div class="app-body"><header class="topbar"><span class="window-title">CCTools — ${editions[state.edition]}</span><span class="muted small">${state.devices.filter(device => device.connected).length} 台设备已连接</span></header>
    <main id="main" tabindex="-1">${pageContent()}</main><div class="split-handle horizontal" role="separator" aria-label="调整结果区高度" aria-orientation="horizontal" tabindex="0" data-split="results"></div><section id="results-dock" class="${state.tasks.length ? '' : 'empty-results'}" aria-label="执行结果与日志">${resultsDock()}</section><footer class="app-footer"><span class="status-message">就绪</span><span>发现 ${state.devices.filter(device => device.transport === state.transport).length} 台 · 已连接 ${state.devices.filter(device => device.transport === state.transport && device.connected).length} 台 · 已选择 ${state.selected.size} 台 · ${active} 项任务进行中</span></footer></div>`;
}
function pageContent() {
    return ({ workspace, tasks: tasksPage, burn: burnPage, factory: factoryPage, settings: settingsPage }[state.page] || workspace)();
}

function resultsDock() {
    const task = state.tasks.find(task => task.id === state.resultId);
    return `<div class="results-toolbar"><b>执行结果与日志</b><select id="result-task" aria-label="查看任务"><option value="">选择任务</option>${[...state.tasks].reverse().map(item => `<option value="${item.id}" ${item.id === state.resultId ? 'selected' : ''}>${item.id} · ${e(item.label)} · ${item.items.length} 台</option>`).join('')}</select><span class="muted small">${task ? '操作执行中可继续查看设备' : '暂无选中的任务'}</span></div><div class="results-body">${task ? taskPanel(task) : '<p class="muted result-empty">执行操作后，在此查看每台设备的进度、结果与日志。</p>'}</div>`;
}
function refreshResults() {
    const dock = document.querySelector('#results-dock');
    if (!dock || document.activeElement?.id === 'result-task') return;
    const focused = dock.contains(document.activeElement) ? document.activeElement : null;
    const focusLog = focused?.closest('details')?.dataset.logDevice;
    const focusAction = focused?.dataset.action;
    const focusDevice = focused?.dataset.device;
    const body = dock.querySelector('.results-body');
    const scroll = body?.scrollTop || 0;
    const openLogs = [...dock.querySelectorAll('details[open]')].map(item => item.dataset.logDevice);
    dock.innerHTML = resultsDock();
    dock.querySelectorAll('details').forEach(item => { item.open = openLogs.includes(item.dataset.logDevice); });
    dock.querySelector('.results-body').scrollTop = scroll;
    if (focusLog) [...dock.querySelectorAll('details')].find(item => item.dataset.logDevice === focusLog)?.querySelector('summary')?.focus({ preventScroll: true });
    else if (focusAction) [...dock.querySelectorAll('[data-action]')].find(item => item.dataset.action === focusAction && item.dataset.device === focusDevice)?.focus({ preventScroll: true });
}
function render({ tick = false } = {}) {
    if (tick) {
        refreshResults();
        const taskNav = document.querySelector('.nav-item[data-page="tasks"]');
        if (taskNav) {
            taskNav.querySelector('b')?.remove();
            const active = state.tasks.filter(task => ['running', 'waiting'].includes(taskStatus(task))).length;
            if (active) { const badge = document.createElement('b'); badge.textContent = String(active); taskNav.append(badge); }
        }
        if (state.page === 'tasks' && !document.querySelector('main').contains(document.activeElement)) document.querySelector('main').innerHTML = tasksPage();
        const status = document.querySelector('.app-footer > span:last-child');
        if (status) status.textContent = `发现 ${state.devices.filter(device => device.transport === state.transport).length} 台 · 已连接 ${state.devices.filter(device => device.transport === state.transport && device.connected).length} 台 · 已选择 ${state.selected.size} 台 · ${state.tasks.filter(task => ['running', 'waiting'].includes(taskStatus(task))).length} 项任务进行中`;
        return;
    }
    if (operation && state.page === 'workspace' && state.workTab !== 'device') operation.ids = [...state.selected];
    const focusedId = document.activeElement?.id;
    const position = document.activeElement?.selectionStart;
    const mainScroll = document.querySelector('main')?.scrollTop || 0;
    const panelScroll = document.querySelector('#work-panel')?.scrollTop || 0;
    const editorScroll = document.querySelector('.operation-editor')?.scrollTop || 0;
    const resultScroll = document.querySelector('.results-body')?.scrollTop || 0;
    app.innerHTML = shell();
    document.querySelector('main').scrollTop = mainScroll;
    if (document.querySelector('#work-panel')) document.querySelector('#work-panel').scrollTop = panelScroll;
    if (document.querySelector('.operation-editor')) document.querySelector('.operation-editor').scrollTop = editorScroll;
    document.querySelector('.results-body').scrollTop = resultScroll;
    if (focusedId && !overlay) {
        const target = document.getElementById(focusedId);
        target?.focus();
        if (typeof position === 'number' && ['text', 'search'].includes(target?.type)) target.setSelectionRange(position, position);
    }
    if (overlay) renderOverlay();
    else { app.inert = false; overlayRoot.innerHTML = ''; document.body.classList.remove('modal-open'); }
}
function renderOverlay() {
    if (!overlay) { render(); return; }
    app.inert = true;
    overlayRoot.innerHTML = modalMarkup();
    document.body.classList.add('modal-open');
}
function openOverlay(value) {
    previousFocus = document.activeElement;
    overlay = value;
    renderOverlay();
    overlayRoot.querySelector('button, input, select')?.focus();
}
function closeOverlay() {
    overlay = null;
    renderOverlay();
    if (previousFocus?.isConnected) previousFocus.focus();
    else document.querySelector('.nav-item.active')?.focus();
}
function notify(text) {
    clearTimeout(toastTimer);
    document.querySelector('#toast-root').innerHTML = `<div class="toast">${icon('info', 18)}${e(text)}</div>`;
    toastTimer = setTimeout(() => document.querySelector('#toast-root').replaceChildren(), 4200);
}
function navigate(page) {
    if (!allowedPage(page)) return;
    if (overlay) closeOverlay();
    state.page = page;
    history.replaceState(null, '', `#${page}`);
    render();
    document.querySelector('main').scrollTop = 0;
}
function openOperation(kind, ids = state.selected) {
    if (operation) operationDrafts.set(operation.kind, operation);
    if (ids !== state.selected) state.selected = new Set(ids);
    if (operationDrafts.has(kind)) {
        // 恢复当前页签的输入；目标始终来自当前的统一选择集合。
        const draft = operationDrafts.get(kind);
        beginOperation(kind, state.selected);
        Object.assign(operation, draft, { ids: [...state.selected] });
    } else beginOperation(kind, state.selected);
    state.workTab = kind;
    state.page = 'workspace';
    overlay = null;
    render();
}
function applyCompletedTasks() {
    for (const task of state.tasks) {
        for (const item of task.items) {
            if (item.status !== 'success' || item.applied) continue;
            const device = getDevice(item.deviceId);
            if (task.action === 'import' || task.action === 'configure') {
                const config = task.options.configurations?.[device.id] || task.options.config;
                device.parameters = { ...device.parameters, ...Object.fromEntries((config?.parameters || []).map(param => [param.key, param.value])), ...task.options.values };
            }
            if (task.action === 'sn') device.sn = task.options.sn;
            if (task.action === 'ota') device.version = 'V2.13.00';
            item.applied = true;
        }
    }
}
function showTask(task) { state.resultId = task.id; overlay = null; render(); }
function modal(title, html, action, label = '确认') {
    modalDraft = { title, html, action, label };
    openOverlay({ type: 'modal' });
}
function searchAddress(side) {
    return [...document.querySelectorAll(`[data-search-side="${side}"]`)].map(input => input.value).join('.');
}
function modalMarkup() {
    return `<div class="overlay centered" data-action="close-overlay-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="drawer-head"><h2 id="modal-title">${modalDraft.title}</h2><button class="icon-btn" data-action="close-overlay" aria-label="关闭">${icon('close')}</button></header><div class="drawer-body">${modalDraft.html}</div><footer class="drawer-footer">${button('取消', 'close-overlay')}${button(modalDraft.label, modalDraft.action, 'primary')}</footer></section></div>`;
}

document.addEventListener('click', async event => {
    const element = event.target.closest('[data-action]');
    if (!element || element.disabled) return;
    const action = element.dataset.action;
    const id = element.dataset.id;
    if (action === 'close-overlay-backdrop') { return; }
    try {
        switch (action) {
            case 'navigate': event.preventDefault(); navigate(element.dataset.page); break;
            case 'close-overlay': closeOverlay(); break;
            case 'transport': if (element.dataset.value === 'MQTT' && state.edition !== 'internal') break; state.transport = element.dataset.value; if (state.transport === 'MQTT') state.remoteEnabled = true; render(); break;
            case 'work-tab': if (element.dataset.kind === 'device') { state.workTab = 'device'; render(); } else openOperation(element.dataset.kind); break;
                        case 'clear-selection': state.selected.clear(); render(); break;
            case 'connect-selected': {
                let count = 0;
                for (const deviceId of state.selected) {
                    const device = getDevice(deviceId);
                    if (device.reachable && !device.occupied) { device.connected = true; device.sessionIp = '192.0.2.200'; count++; }
                }
                render(); notify(`已连接 ${count} 台设备，离线设备无法连接`); break;
            }
            case 'disconnect-selected': {
                for (const deviceId of state.selected) { const device = getDevice(deviceId); device.connected = false; device.sessionIp = ''; }
                render(); notify('已断开所选设备'); break;
            }
            case 'discover': {
                if (state.transport === 'MQTT') {
                    if (!state.mqttConnected) document.querySelector('[data-action="mqtt-settings"]').click();
                    else notify('远程设备搜索完成');
                    break;
                }
                if (searchTimer) break;
                const start = searchAddress('start');
                const end = searchAddress('end');
                const error = validateSearch(start, end);
                if (error) { document.querySelector('#search-range-error').textContent = error; break; }
                state.searchStart = start; state.searchEnd = end; state.searchConfigured = true;
                localStorage.setItem('cctools-search-range', JSON.stringify([state.searchStart, state.searchEnd]));
                state.searchProgress = 0; render();
                searchTimer = setInterval(() => {
                    state.searchProgress += 25;
                    if (state.searchProgress >= 100) { clearInterval(searchTimer); searchTimer = null; state.searchProgress = null; notify('搜索完成'); }
                    render();
                }, 250);
                break;
            }
            case 'mqtt-settings': modal('远程调试服务器', `<label class="field-label">服务器类型<select id="mqtt-type"><option value="standard">标准 MQTT</option><option value="openvalley">OpenValley</option></select></label><label class="field-label" data-mqtt-kind="standard">项目名称<input id="mqtt-project"></label><label class="field-label" data-mqtt-kind="standard">服务器地址<input id="mqtt-host"></label><label class="field-label" data-mqtt-kind="standard">端口号<input id="mqtt-port" type="number" min="1" max="65535" value="1883"></label><label class="field-label" data-mqtt-kind="standard">客户端 ID<input id="mqtt-client" value="CCTools-review"></label><label class="field-label" data-mqtt-kind="openvalley" hidden>服务器环境<select><option>生产环境</option><option>测试环境</option><option>开发环境</option></select></label><label class="field-label">用户名<input id="mqtt-user"></label><label class="field-label">密码<input id="mqtt-password" type="password"></label><label class="field-label" data-mqtt-kind="openvalley" hidden>租户 ID<input id="mqtt-tenant"></label><div data-mqtt-kind="openvalley" hidden>${button('登录', 'mqtt-login')}<label class="field-label">产品<select id="mqtt-product"><option value="">请先登录</option></select></label></div>`, 'mqtt-connect', '连接'); break;
            case 'mqtt-login': {
                if (!document.querySelector('#mqtt-user').value.trim() || !document.querySelector('#mqtt-password').value || !document.querySelector('#mqtt-tenant').value.trim()) { notify('用户名、密码和租户 ID 不能为空'); break; }
                document.querySelector('#mqtt-product').innerHTML = '<option value="CT15">CT15</option><option value="CT13">CT13</option>'; notify('已登录，请选择产品'); break;
            }
            case 'mqtt-connect': {
                if (document.querySelector('#mqtt-type').value === 'standard') {
                    if (!document.querySelector('#mqtt-host').value.trim() || !document.querySelector('#mqtt-project').value.trim()) { notify('项目名称和服务器地址不能为空'); break; }
                    const port = Number(document.querySelector('#mqtt-port').value);
                    if (!Number.isInteger(port) || port < 1 || port > 65535) { notify('请输入有效的端口号'); break; }
                } else if (!document.querySelector('#mqtt-product').value) { notify('请先登录并选择要调试的产品'); break; }
                state.mqttConnected = true; closeOverlay(); render(); notify('MQTT 服务器已连接'); break;
            }
            case 'activation-login': {
                const user = document.querySelector('#activation-user').value.trim();
                if (!user || !document.querySelector('#activation-password').value) { notify('用户名和密码不能为空'); break; }
                operation.activationUser = user; renderOverlay(); notify('已登录，请选择产品'); break;
            }
            case 'config-tab': operation.configTab = element.dataset.value; renderOverlay(); break;
            case 'operate': openOperation(element.dataset.kind); break;
            case 'device-operate': openOperation(element.dataset.kind, [id]); break;
            case 'detail': if (state.detailId !== id) { state.paramDraft = {}; state.paramTab = 'system'; state.detailTab = 'overview'; } state.detailId = id; state.workTab = 'device'; render(); break;
            case 'detail-tab': state.detailTab = element.dataset.value; renderOverlay(); break;
            case 'choose-file': document.querySelector('#operation-file').click(); break;
            case 'operation-submit': {
                operation.error = validateOperation();
                if (operation.error) { renderOverlay(); break; }
                const configurations = Object.fromEntries(eligible().map(({ device }) => {
                    const file = operation.files.find(file => file.name === operation.mappings[device.id]);
                    const config = operation.mode === 'same' ? operation.config : file?.workbook ? { parameters: file.workbook[operation.paramType].find(row => row.sn === device.sn)?.parameters || [] } : file?.config;
                    return [device.id, config];
                }));
                const values = operation.kind === 'configure' ? Object.fromEntries([...operation.checked].map(key => [key, operation.values[key]])) : {};
                const task = createTask(operation.kind, eligible().map(({ device }) => device.id), { fileName: operation.files.map(file => file.name).join(', '), config: operation.config, configurations, values, demoFailure: new URLSearchParams(location.search).get('scenario') === 'failure', safetyBackup: operation.safetyBackup, scope: operation.scope, backupRange: operation.backupRange, backupCategories: operation.backupCategories });
                if (operation.safetyBackup) task.items.forEach(item => { item.backup = structuredClone(getDevice(item.deviceId).parameters); item.logs.push('执行前参数已备份'); });
                operation.error = ''; showTask(task); notify('任务已创建，进度显示在下方'); break;
            }
            case 'task-filter': state.taskFilter = element.dataset.value; render(); break;
            case 'task-detail': state.resultId = id; render(); break;
            case 'retry-task': { const task = state.tasks.find(task => task.id === id); showTask(retryFailed(task)); notify('已创建独立重试任务，仅包含失败设备'); break; }
            case 'cancel-task': cancelQueued(state.tasks.find(task => task.id === id)); render(); notify('已取消尚未执行的设备，正在执行的操作继续'); break;
            case 'led-pass': case 'led-fail': confirmLed(state.tasks.find(task => task.id === element.dataset.task), element.dataset.device, action === 'led-pass'); render(); break;
            case 'download-config': {
                const task = state.tasks.find(task => task.id === element.dataset.task);
                if (task?.options.scope === 'raw') {
                    const device = getDevice(element.dataset.device);
                    const names = task.options.backupRange === 'all' ? ['系统参数', '子板配置'] : task.options.backupCategories || ['系统参数', '子板配置'];
                    if (names.includes('系统参数')) download(`${device.sn}_sysConfig.json`, JSON.stringify(device.parameters, null, 2), 'application/json');
                    if (names.includes('子板配置')) download(`${device.sn}_submoduleConfig.json`, '[]', 'application/json');
                    break;
                }
                const device = getDevice(element.dataset.device);
                download(`${device.sn}_配置.xlsx`, writeWorkbook([device]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); break;
            }
            case 'download-backup': {
                const task = state.tasks.find(task => task.id === element.dataset.task);
                const item = task.items.find(item => item.deviceId === element.dataset.device);
                download(`${item.sn}_执行前备份.xlsx`, writeWorkbook([{ ...getDevice(item.deviceId), parameters: item.backup }]), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); break;
            }
            case 'param-tab': state.paramTab = element.dataset.value; state.paramDraft = {}; renderOverlay(); break;
            case 'param-query': state.paramDraft = {}; renderOverlay(); notify('参数已查询'); break;
            case 'param-revoke': delete state.paramDraft[element.dataset.key]; renderOverlay(); break;
            case 'param-default': modal('恢复默认参数', `<p>确认恢复 ${e(systemParameters.find(([key]) => key === element.dataset.key)?.[1])} 的默认值？</p><input type="hidden" id="reset-param-key" value="${e(element.dataset.key)}">`, 'param-default-confirm', '恢复默认'); break;
            case 'param-default-confirm': {
                const key = document.querySelector('#reset-param-key').value;
                getDevice(state.detailId).parameters[key] = systemParameters.find(([name]) => name === key)?.[2] || '';
                closeOverlay(); notify('参数已恢复默认'); break;
            }
            case 'param-save': {
                if (!Object.keys(state.paramDraft).length) { notify('没有待保存的修改'); break; }
                if (Object.values(state.paramDraft).some(value => !value.trim())) { notify('参数值不能为空'); break; }
                const task = createTask('configure', [state.detailId], { values: { ...state.paramDraft } });
                state.paramDraft = {}; showTask(task); break;
            }
            case 'clear-terminal': getDevice(state.detailId).terminalLines = []; document.querySelector('#terminal-output').replaceChildren(); break;
            case 'terminal-shortcuts': modal('快捷指令管理', '<label class="field-label">名称<input id="shortcut-name"></label><label class="field-label">内容<input id="shortcut-command"></label>', 'terminal-shortcut-save', '添加'); break;
            case 'terminal-shortcut-save': {
                const name = document.querySelector('#shortcut-name').value.trim();
                const command = document.querySelector('#shortcut-command').value.trim();
                if (!name || !command) { notify('名称和内容不能为空'); break; }
                state.shortcuts ||= []; state.shortcuts.push({ name, command }); closeOverlay(); notify('快捷指令已添加'); break;
            }
            case 'file-refresh': renderOverlay(); notify('文件列表已刷新'); break;
            case 'file-upload': {
                const chosen = [...document.querySelector('#local-files').files];
                if (!chosen.length) { notify('请先选择电脑文件'); break; }
                const device = getDevice(state.detailId); device.files ||= [{ name: 'sysConfig.json', size: '1.2 KB' }, { name: 'submoduleConfig.json', size: '0.8 KB' }];
                chosen.forEach(file => { device.files = device.files.filter(item => item.name !== file.name); device.files.push({ name: file.name, size: `${file.size} B` }); });
                renderOverlay(); document.querySelector('#file-transfer-log').textContent = `${chosen.length} 个文件已导入`; break;
            }
            case 'file-export': case 'file-delete': {
                const chosen = [...document.querySelectorAll('[data-remote-file]:checked')].map(input => input.dataset.remoteFile);
                if (!chosen.length) { notify('请先选择控制器文件'); break; }
                if (action === 'file-export') { chosen.forEach(name => download(name, '{}')); document.querySelector('#file-transfer-log').textContent = `${chosen.length} 个文件已导出`; }
                else { state.pendingDelete = chosen; modal('删除控制器文件', `<p>确认删除以下文件？</p><p>${chosen.map(e).join('<br>')}</p>`, 'file-delete-confirm', '删除'); }
                break;
            }
            case 'file-delete-confirm': {
                const device = getDevice(state.detailId); device.files = (device.files || [{ name: 'sysConfig.json', size: '1.2 KB' }, { name: 'submoduleConfig.json', size: '0.8 KB' }]).filter(file => !state.pendingDelete.includes(file.name));
                closeOverlay(); notify('所选文件已删除'); break;
            }
            case 'save-terminal': download('terminal-demo.log', document.querySelector('#terminal-output').innerText); break;
            case 'burn-part': state.burnPart = element.dataset.value; render(); break;
            case 'burn-file': document.querySelector('#burn-file-input').click(); break;
                        case 'burn-start': {
                const fileName = document.querySelector('#burn-filename').value;
                if (!fileName) { notify('请先选择固件文件'); break; }
                const target = document.querySelector('#burn-target')?.value || 'J-Link';
                const id = `burn-${target}`;
                if (!getDevice(id)) state.flashTargets.push({ id, name: `${state.burnModel} ${state.burnPart}`, model: state.burnModel, sn: target, ip: '本地烧录接口', version: '—', connected: false, reachable: true, transport: 'FLASH', group: '本地烧录' });
                const task = createTask('burn', [id], { fileName, part: state.burnPart });
                if (state.burnPart === '蓝牙/星闪') task.items[0].logs.push('请复位蓝牙/星闪模组');
                showTask(task); break;
            }
            case 'factory-stage': state.factoryStages[state.factoryStage] = [...state.factoryItems]; state.factoryStage = element.dataset.value; state.factoryItems = [...(state.factoryStages[state.factoryStage] || state.factoryItems)]; render(); break;
            case 'factory-start': {
                const ids = [...document.querySelectorAll('[data-factory-device]:checked')].map(input => input.dataset.factoryDevice);
                if (!ids.length) { notify('没有已连接的测试设备'); break; }
                if (!state.factoryItems.length) { notify('请至少配置一个测试项'); break; }
                showTask(createTask('factory', ids, { stage: state.factoryStage, items: [...state.factoryItems], params: { ...state.factoryParams } })); break;
            }
            case 'factory-settings': modal('测试项配置', `<label class="field-label">测试阶段<select id="factory-config-stage">${['PCBA', '整机', '老化'].map(stage => `<option ${stage === state.factoryStage ? 'selected' : ''}>${stage}</option>`).join('')}</select></label><div class="test-checkboxes">${factoryItems.map((name, index) => `<label class="check-line"><input type="checkbox" name="factory-item" value="${name}" ${state.factoryItems.includes(name) ? 'checked' : ''}>${index + 1}. ${name}</label>`).join('')}</div>${button('导出三个阶段测试项', 'factory-profile-export')}<h3>测试参数</h3><label class="field-label">蓝牙固件版本（留空仅读取）<input data-factory-param="bluetooth" value="${e(state.factoryParams.bluetooth || '')}"></label><label class="field-label">主控版本<input data-factory-param="mainVersion" value="${e(state.factoryParams.mainVersion || '')}"></label><label class="field-label">子板版本<input data-factory-param="subVersion" value="${e(state.factoryParams.subVersion || '')}"></label><label class="field-label">子板类型编号（按槽位顺序，以逗号分隔）<input data-factory-param="subModules" value="${e(state.factoryParams.subModules || '')}"></label><label class="field-label">WiFi 名称<input data-factory-param="ssid" value="${e(state.factoryParams.ssid || '')}"></label><label class="field-label">WiFi 密码<input data-factory-param="password" type="password" value="${e(state.factoryParams.password || '')}"></label>`, 'factory-settings-save', '保存'); break;
            case 'factory-settings-save': {
                const items = [...document.querySelectorAll('input[name="factory-item"]:checked')].map(input => input.value);
                if (!items.length) { notify('请至少选择一个测试项'); break; }
                for (const input of document.querySelectorAll('[data-factory-param]')) {
                    if (['bluetooth', 'ssid', 'password'].includes(input.dataset.factoryParam) && new TextEncoder().encode(input.value).length > 63) throw new Error('蓝牙版本、WiFi 名称和密码最多 63 个 UTF-8 字节');
                }
                state.factoryItems = items; state.factoryStages[state.factoryStage] = items;
                state.factoryParams = Object.fromEntries([...document.querySelectorAll('[data-factory-param]')].map(input => [input.dataset.factoryParam, input.value]));
                closeOverlay(); render(); notify('测试项已保存'); break;
            }
            case 'factory-stop': {
                for (const task of state.tasks.filter(task => task.action === 'factory')) for (const item of task.items) if (['queued', 'running', 'waiting'].includes(item.status)) { item.status = 'cancelled'; item.logs.push('测试已停止'); }
                render(); notify('测试已停止'); break;
            }
            case 'factory-import': modal('导入测试项', '<label class="field-label">测试项文件<input type="file" id="factory-profile-file" accept=".ctfp"></label><p id="factory-file-error" class="danger-text small"></p>', 'factory-profile-confirm', '导入'); break;
            case 'factory-profile-export': {
                const stage = document.querySelector('#factory-config-stage').value;
                const items = [...document.querySelectorAll('input[name="factory-item"]:checked')].map(input => input.value);
                const params = Object.fromEntries([...document.querySelectorAll('[data-factory-param]')].map(input => [input.dataset.factoryParam, input.value]));
                const stages = Object.fromEntries(['PCBA', '整机', '老化'].map(name => [name, name === stage ? items : state.factoryStages[name] || [...state.factoryItems]]));
                const now = new Date();
                const batchDate = `${now.getFullYear()}${[now.getMonth() + 1, now.getDate(), now.getHours(), now.getMinutes()].map(value => String(value).padStart(2, '0')).join('')}`;
                const bytes = await encodeFactoryProfile({ stages, params, batchDate });
                download(`factory_test_${batchDate}.ctfp`, bytes, 'application/octet-stream'); notify('测试项已导出'); break;
            }
            case 'factory-profile-confirm': {
                const file = document.querySelector('#factory-profile-file').files[0];
                if (!file || !file.name.endsWith('.ctfp') || !file.size || file.size > 65536) { document.querySelector('#factory-file-error').textContent = '请选择有效的测试项文件'; break; }
                const profile = await decodeFactoryProfile(new Uint8Array(await file.arrayBuffer()));
                state.factoryStages = profile.stages; state.factoryParams = profile.params; state.factoryBatch = profile.batchDate; state.factoryItems = [...profile.stages[state.factoryStage]];
                state.factoryProfile = file.name; closeOverlay(); render(); notify('测试项已导入'); break;
            }
            case 'factory-export': modal('导出测试结果', `<label class="field-label">开始日期<input id="factory-export-start" type="date" value="${new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10)}"></label><label class="field-label">结束日期<input id="factory-export-end" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><h3>测试阶段</h3>${['PCBA', '整机', '老化'].map(stage => `<label class="check-line"><input name="export-stage" type="checkbox" checked value="${stage}">${stage}</label>`).join('')}`, 'factory-export-confirm', '导出'); break;
            case 'factory-export-confirm': {
                const start = document.querySelector('#factory-export-start').value;
                const end = document.querySelector('#factory-export-end').value;
                if (!start || !end || start > end) { notify('请选择有效的日期范围'); break; }
                const stages = [...document.querySelectorAll('[name="export-stage"]:checked')].map(input => input.value);
                if (!stages.length) { notify('请至少选择一个测试阶段'); break; }
                const tasks = state.tasks.filter(task => task.action === 'factory' && stages.includes(task.options.stage) && task.date >= start && task.date <= end);
                if (!tasks.length) { notify('所选范围没有测试记录'); break; }
                const book = window.XLSX.utils.book_new();
                window.XLSX.utils.book_append_sheet(book, window.XLSX.utils.aoa_to_sheet([['任务', '阶段', 'SN', '结果'], ...tasks.flatMap(task => task.items.map(item => [task.id, task.options.stage, item.sn, item.status]))]), '测试结果');
                download('工厂测试结果.xlsx', window.XLSX.write(book, { type: 'array', bookType: 'xlsx' }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); closeOverlay(); break;
            }
            case 'sn-dialog': modal('SN 烧录', `<label class="field-label">目标设备<select id="sn-device">${state.devices.filter(device => device.connected).map(device => `<option value="${device.id}">${e(device.deviceId)} · ${e(device.sn)}</option>`).join('')}</select></label><label class="field-label">新序列号<input id="sn-value" placeholder="扫描或输入设备 SN"></label><p id="sn-error" class="danger-text small"></p>`, 'sn-confirm', '确认烧录'); break;
            case 'sn-confirm': {
                const value = document.querySelector('#sn-value').value.trim();
                if (!value) { document.querySelector('#sn-error').textContent = '请输入设备 SN'; break; }
                showTask(createTask('sn', [document.querySelector('#sn-device').value], { sn: value })); break;
            }
            case 'factory-activate': openOperation('activate', state.devices.filter(device => device.connected).map(device => device.id)); break;
            case 'save-settings': {
                const lines = Number(document.querySelector('#log-lines').value);
                if (!Number.isInteger(lines) || lines < 0 || lines > 99999999) { notify('日志缓冲区行数需为 0～99999999 的整数'); break; }
                const autoLog = document.querySelector('#log-auto-save').checked;
                const logPath = document.querySelector('#log-path').value.trim();
                if (autoLog && !logPath) { notify('开启自动保存前请选择日志保存路径'); break; }
                state.settings = { tray: document.querySelector('#minimize-tray').checked, labelType: document.querySelector('#label-type').value, logLines: document.querySelector('#log-lines').value, logPath, autoLog, project: document.querySelector('#settings-project').value };
                state.remoteEnabled = !!document.querySelector('#remote-enabled')?.checked;
                if (!state.remoteEnabled) state.transport = 'LAN';
                if (document.querySelector('#session-key')) document.querySelector('#session-key').value = '';
                render(); notify('设置已保存'); break;
            }
        }
    } catch (error) { notify(error.message); }
});
document.addEventListener('change', async event => {
    const input = event.target;
    if (input.dataset.configCheck) {
        if (input.checked) { operation.checked.add(input.dataset.configCheck); operation.values[input.dataset.configCheck] ??= systemParameters.find(([key]) => key === input.dataset.configCheck)?.[2] || ''; }
        else operation.checked.delete(input.dataset.configCheck);
        renderOverlay(); return;
    }
    if (input.dataset.backupCategory) { operation.backupCategories = [...document.querySelectorAll('[data-backup-category]:checked')].map(item => item.dataset.backupCategory); return; }
    if (input.dataset.deviceCheck) {
        if (input.checked) state.selected.add(input.dataset.deviceCheck); else state.selected.delete(input.dataset.deviceCheck);
        render(); return;
    }
    if (input.dataset.configValue === 'wirelessExtensionModuleType') { operation.values.wirelessExtensionModuleType = input.value; if (input.value !== 'wifi') { operation.checked.delete('wifiName'); operation.checked.delete('wifiPassword'); } renderOverlay(); return; }
    if (input.dataset.configValue) return;
    if (input.dataset.targetToggle) {
        if (input.checked) operation.skipped.delete(input.dataset.targetToggle); else operation.skipped.add(input.dataset.targetToggle);
        renderOverlay(); return;
    }
    if (input.dataset.mapDevice) { operation.mappings[input.dataset.mapDevice] = input.value; renderOverlay(); return; }
    switch (input.id) {
        case 'mqtt-type': document.querySelectorAll('[data-mqtt-kind]').forEach(field => { field.hidden = field.dataset.mqttKind !== input.value; }); break;
        case 'select-all': visibleDevices().forEach(device => input.checked ? state.selected.add(device.id) : state.selected.delete(device.id)); render(); break;
        case 'result-task': state.resultId = input.value; render(); break;
        case 'model-filter': state.model = input.value; render(); break;
        case 'connection-filter': state.connection = input.value; render(); break;
                case 'preview-device': operation.previewId = input.value; renderOverlay(); break;
        case 'activation-product': operation.activationProduct = input.value; break;
        case 'safety-backup': operation.safetyBackup = input.checked; break;
                case 'import-param-type': operation.paramType = input.value; operation.config = null; operation.files = []; renderOverlay(); break;
        case 'import-source-row': operation.sourceSn = input.value; operation.config = { model: 'any', parameters: operation.files[0].workbook[operation.paramType].find(row => row.sn === input.value)?.parameters || [] }; renderOverlay(); break;
        case 'backup-range': operation.backupRange = input.value; renderOverlay(); break;
        case 'factory-config-stage': state.factoryStages[state.factoryStage] = [...document.querySelectorAll('input[name="factory-item"]:checked')].map(box => box.value); state.factoryStage = input.value; state.factoryItems = [...(state.factoryStages[input.value] || state.factoryItems)]; document.querySelectorAll('input[name="factory-item"]').forEach(box => { box.checked = state.factoryItems.includes(box.value); }); break;
        case 'export-scope': operation.scope = input.value; renderOverlay(); break;
        case 'burn-model': state.burnModel = input.value; render(); break;
        case 'burn-file-input': state.burnFiles ||= {}; state.burnFiles[`${state.burnModel}/${state.burnPart}`] = input.files[0]?.name || ''; document.querySelector('#burn-filename').value = input.files[0]?.name || ''; break;
        case 'operation-file': {
            const current = operation;
            try {
                const files = [...input.files];
                if (!files.length) break;
                if (current.kind === 'import') {
                    if (files.length > 20 || files.some(file => file.size > 10 * 1024 * 1024)) throw new Error('最多选择 20 个配置文件，每个不超过 10 MB');
                    if (new Set(files.map(file => file.name)).size !== files.length) throw new Error('配置文件名称重复，请更名后重新选择');
                    const parsed = [];
                    for (const file of files) {
                        if (!/\.xlsx?$/i.test(file.name)) throw new Error('请选择 Excel 配置文件（.xlsx / .xls）');
                        const workbook = readWorkbook(await file.arrayBuffer());
                        const first = workbook[current.paramType][0];
                        if (!first) throw new Error('所选参数表中没有设备数据行');
                        parsed.push({ name: file.name, workbook, config: { model: 'any', parameters: first.parameters } });
                    }
                    if (operation !== current) break;
                    current.files = parsed; current.config = parsed[0].config; current.sourceSn = parsed[0].workbook[current.paramType][0].sn; current.mappings = Object.fromEntries(current.ids.map(id => [id, parsed.find(file => file.workbook[current.paramType].some(row => row.sn === getDevice(id).sn))?.name || '']));
                } else {
                    current.files = files.map(file => ({ name: file.name, size: file.size }));

                }
                current.error = '';
            } catch (error) { if (operation === current) { current.error = error.message; current.config = null; current.files = []; } }
            if (operation === current) renderOverlay();
            break;
        }
    }
    if (input.name === 'import-mode') { operation.mode = input.value; renderOverlay(); }
});
document.addEventListener('input', event => {
    if (event.target.id === 'device-search') { state.query = event.target.value; render(); }
    if (event.target.dataset.searchSide) {
        state.searchStart = searchAddress('start'); state.searchEnd = searchAddress('end');
        document.querySelector('#search-range-error').textContent = '';
    }
    if (event.target.dataset.configValue) {
        operation.values[event.target.dataset.configValue] = event.target.value;
        const preview = document.querySelector('.inline-preview');
        if (preview) preview.innerHTML = operationPreview();
    }
    if (event.target.dataset.paramValue) state.paramDraft[event.target.dataset.paramValue] = event.target.value;
});
document.addEventListener('submit', event => {
    if (event.target.id !== 'terminal-form') return;
    event.preventDefault();
    const input = event.target.elements.command;
    const command = input.value.trim();
    if (!command) return;
    const output = document.querySelector('#terminal-output');
    const line = document.createElement('div');
    const answer = ({ help: '可用指令：help / version / uptime', version: getDevice(state.detailId).version, uptime: 'up 2 days, 04:18' })[command] || 'command not found';
    line.textContent = `❯ ${command}\n${answer}`;
    (getDevice(state.detailId).terminalLines ||= []).push(line.textContent);
    output.append(line); output.scrollTop = output.scrollHeight; input.value = '';
});
document.addEventListener('keydown', event => {
    if (!overlay) return;
    if (event.key === 'Escape') { closeOverlay(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...overlayRoot.querySelectorAll('button:not([disabled]), input:not([hidden]):not([disabled]), select:not([disabled]), a[href], summary')].filter(element => element.getClientRects().length);
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
state.edition = new URLSearchParams(location.search).get('edition') || 'internal';
if (!editions[state.edition]) state.edition = 'internal';
state.page = state.edition === 'factory' ? 'factory' : 'workspace';
const route = location.hash.slice(1);
if (['workspace', 'tasks', 'burn', 'factory', 'settings'].includes(route) && allowedPage(route)) state.page = route;
try {
    const range = JSON.parse(localStorage.getItem('cctools-search-range'));
    if (Array.isArray(range) && range.length === 2 && typeof range[0] === 'string' && typeof range[1] === 'string') {
        const end = /^\d{1,3}$/.test(range[1]) ? `${range[0].split('.').slice(0, 3).join('.')}.${range[1]}` : range[1];
        if (!validateSearch(range[0], end)) { state.searchStart = range[0]; state.searchEnd = end; state.searchConfigured = true; }
    }
} catch { /* 本地范围损坏时使用缺省值。 */ }
document.querySelectorAll('[data-preview-edition]').forEach(link => {
    const url = new URL(location.href);
    url.searchParams.set('edition', link.dataset.previewEdition); url.hash = '';
    link.href = url.pathname + url.search;
    if (link.dataset.previewEdition === state.edition) link.setAttribute('aria-current', 'page');
});
render();
setInterval(() => { if (tickTasks()) { applyCompletedTasks(); render({ tick: true }); } }, 700);

let resizing = null;
function setPaneSize(kind, size) {
    const max = kind === 'devices' ? Math.max(300, document.querySelector('.workspace-split').clientWidth - 430) : Math.min(innerHeight * 0.5, innerHeight - 400);
    const min = kind === 'devices' ? 300 : 110;
    document.documentElement.style.setProperty(kind === 'devices' ? '--device-pane-width' : '--results-height', `${Math.round(Math.max(min, Math.min(max, size)))}px`);
}
document.addEventListener('pointerdown', event => {
    const handle = event.target.closest('[data-split]');
    if (!handle) return;
    const kind = handle.dataset.split;
    resizing = { kind, start: kind === 'devices' ? event.clientX : event.clientY, size: document.querySelector(kind === 'devices' ? '.device-browser' : '#results-dock').getBoundingClientRect()[kind === 'devices' ? 'width' : 'height'] };
    handle.setPointerCapture(event.pointerId); event.preventDefault();
});
document.addEventListener('pointermove', event => {
    if (!resizing) return;
    const delta = resizing.kind === 'devices' ? event.clientX - resizing.start : resizing.start - event.clientY;
    setPaneSize(resizing.kind, resizing.size + delta);
});
document.addEventListener('pointerup', () => { resizing = null; });
document.addEventListener('pointercancel', () => { resizing = null; });
document.addEventListener('keydown', event => {
    const kind = event.target.dataset?.split;
    if (!kind || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const size = document.querySelector(kind === 'devices' ? '.device-browser' : '#results-dock').getBoundingClientRect()[kind === 'devices' ? 'width' : 'height'];
    setPaneSize(kind, size + (['ArrowRight', 'ArrowUp'].includes(event.key) ? 20 : -20));
});
