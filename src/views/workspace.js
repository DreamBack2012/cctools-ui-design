import { state, visibleDevices, activeTaskFor, getDevice, escapeHtml as e } from '../core/store.js';
import { icon, badge, button, empty } from '../ui.js';
import { operation, operationPanel } from './operations.js';
import { devicePanel } from './pages.js';

export function searchFields() {
    return ['start', 'end'].map(side => {
        const label = side === 'start' ? '起始地址' : '结束地址';
        const address = side === 'start' ? state.searchStart : state.searchEnd;
        return `<label class="ip-label" id="search-${side}-label">${label}</label><div class="ipv4-input" role="group" aria-labelledby="search-${side}-label">${address.split('.').map((part, index) => `<input id="search-${side}-octet-${index}" data-search-side="${side}" inputmode="numeric" maxlength="3" value="${e(part)}" aria-label="${label}第 ${index + 1} 段">${index < 3 ? '<span>.</span>' : ''}`).join('')}</div>`;
    }).join('');
}

export function workspace() {
    const devices = visibleDevices();
    const transportDevices = state.devices.filter(device => device.transport === state.transport);
    const detail = getDevice(state.detailId);
    const tabs = [['device', '设备管理'], ...state.edition !== 'factory' ? [['import', '配置导入'], ['export', '配置备份'], ['configure', '批量配置']] : [], ['ota', 'OTA 升级'], ['reboot', '重启'], ['activate', '设备激活']];
    return `<div class="desktop-workspace">
    <div class="discovery-toolbar"><div class="segmented">${[['LAN', '局域网设备'], ['MQTT', '云端设备']].map(([id, label]) => `<button data-action="transport" data-value="${id}" class="${state.transport === id ? 'active' : ''}" ${id === 'MQTT' && state.edition !== 'internal' ? 'disabled title="远程调试仅内测版支持"' : ''}>${label}<span class="transport-count">${id === 'MQTT' && state.edition !== 'internal' ? '—' : state.devices.filter(device => device.transport === id).length}</span></button>`).join('')}</div></div>
    <div class="discovery-actions">${state.transport === 'LAN' ? `${searchFields()}${button(state.searchProgress !== null ? `搜索中 ${state.searchProgress}%` : '搜索设备', 'discover', '', 'search', state.searchProgress !== null ? 'disabled' : '')}<span id="search-range-error" class="danger-text small" role="alert"></span>` : `${button(state.mqttConnected ? 'MQTT 已连接 · 配置' : '连接 MQTT 服务器', 'mqtt-settings')}${button('搜索设备', 'discover', '', 'search')}`}</div>
    <div class="workspace-split">
    <section class="device-browser" aria-label="设备列表">
    <div class="filters"><label class="search-field">${icon('search', 15)}<input id="device-search" placeholder="筛选编号、SN、IP…" value="${e(state.query)}" aria-label="搜索设备"></label><select id="model-filter" aria-label="筛选型号"><option value="">全部型号</option>${['CT11', 'CT13', 'CT15', 'CT16'].map(model => `<option ${state.model === model ? 'selected' : ''}>${model}</option>`).join('')}</select><select id="connection-filter" aria-label="筛选连接状态"><option value="">全部状态</option><option value="connected" ${state.connection === 'connected' ? 'selected' : ''}>已连接</option><option value="other" ${state.connection === 'other' ? 'selected' : ''}>未连接 / 离线</option></select></div>
    <div class="selection-bar"><span>已选择 <b>${state.selected.size}</b> 台</span><div class="button-row">${button('连接', 'connect-selected', '', '', state.selected.size ? '' : 'disabled')}${button('断开', 'disconnect-selected', '', '', state.selected.size ? '' : 'disabled')}${button('清除', 'clear-selection', '', '', state.selected.size ? '' : 'disabled')}</div></div>
    <div class="table-wrap"><table class="device-table"><thead><tr><th class="check-col"><input type="checkbox" id="select-all" aria-label="全选当前列表" ${devices.length && devices.every(device => state.selected.has(device.id)) ? 'checked' : ''}></th><th>设备 / 序列号</th><th>地址 / 型号</th><th>状态</th></tr></thead><tbody>${devices.map(device => `<tr class="${state.selected.has(device.id) ? 'selected-row' : ''} ${state.detailId === device.id ? 'current-device' : ''}"><td><input type="checkbox" data-device-check="${device.id}" aria-label="选择 ${e(device.name)}" ${state.selected.has(device.id) ? 'checked' : ''}></td><td><button class="device-name" data-action="detail" data-id="${device.id}" title="${e(device.deviceId)}">${e(state.settings.labelType === 'IP地址' ? device.ip : state.settings.labelType === '控制器名称' ? device.name : device.sn)}</button><div class="small muted">${e(device.name)}</div></td><td><span class="mono">${e(device.ip)}</span><div class="small muted">${e(device.model)}</div></td><td>${activeTaskFor(device.id) ? badge('执行中', 'amber') : device.occupied ? badge('已占用', 'amber') : device.connected ? badge('已连接', 'green') : badge(device.reachable ? '待连接' : '离线', 'neutral')}</td></tr>`).join('')}</tbody></table>${devices.length ? '' : empty('没有匹配的设备', '调整筛选条件或重新搜索。')}</div>
    <div class="table-footer">发现 ${transportDevices.length} 台 · 已连接 ${transportDevices.filter(device => device.connected).length} 台</div></section>
    <div class="split-handle vertical" role="separator" aria-label="调整设备列表宽度" aria-orientation="vertical" tabindex="0" data-split="devices"></div>
    <section class="workspace-editor" aria-label="操作工作区"><div class="work-tabs" role="tablist" aria-label="设备操作">${tabs.map(([kind, label]) => `<button role="tab" aria-selected="${state.workTab === kind}" data-action="work-tab" data-kind="${kind}" class="${state.workTab === kind ? 'active' : ''}">${label}</button>`).join('')}</div><div id="work-panel">${state.workTab === 'device' ? detail ? `<div class="current-target">当前设备：${e(detail.sn)} <span class="muted">${e(detail.ip)}</span></div>${devicePanel(detail)}` : empty('选择设备查看信息', '点击左侧设备名称查看参数、终端和文件；勾选设备可执行批量操作。', 'devices') : operation ? operationPanel() : ''}</div></section>
    </div></div>`;
}
