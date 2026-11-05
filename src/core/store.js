import { systemParameters } from './catalog.js';
// 原型数据与设备能力集中维护，界面不按产品名称散落判断。
export const capabilityLabels = {
    ota: 'OTA 升级', import: '导入配置', export: '导出配置', configure: '批量配置',
    reboot: '重启设备', terminal: '日志终端', files: '文件管理', params: '参数管理', activate: '设备激活',
};
const legacy = Object.keys(capabilityLabels);
export const profiles = {
    CT11: legacy, CT13: legacy, CT15: legacy,
    CT16: ['reboot'],
};
export const actionLabels = { ...capabilityLabels, burn: '固件烧录', factory: '工厂测试', sn: 'SN 烧录' };
export const demoDevices = [
    { id: 'd1', name: '装配一线 · 01', model: 'CT15', sn: 'C15KH2661500000101', ip: '192.0.2.101', version: 'V2.12.01', connected: true, reachable: true, transport: 'LAN', group: '装配一线' },
    { id: 'd2', name: '装配一线 · 02', model: 'CT15', sn: 'C15KH2661500000102', ip: '192.0.2.102', version: 'V2.12.01', connected: true, reachable: true, transport: 'LAN', group: '装配一线' },
    { id: 'd3', name: '装配一线 · 03', model: 'CT15', sn: 'C15KH2661500000103', ip: '192.0.2.103', version: 'V2.11.08', connected: true, reachable: true, transport: 'LAN', group: '装配一线' },
    { id: 'd4', name: '调试台 · CT16', model: 'CT16', sn: 'C16KH2661500000001', ip: '192.0.2.16', version: 'ZAIOHOS V6.1.1', connected: true, reachable: true, transport: 'LAN', group: '研发调试' },
    { id: 'd5', name: '装配二线 · 01', model: 'CT13', sn: 'C13KH2661500000201', ip: '192.0.2.111', version: 'V2.10.03', connected: false, reachable: true, transport: 'LAN', group: '装配二线' },
    { id: 'd6', name: '测试样机 · CT11', model: 'CT11', sn: 'C11KH2661500000008', ip: '192.0.2.118', version: 'V1.08.02', connected: false, reachable: false, transport: 'LAN', group: '研发调试' },
    { id: 'd7', name: '远程站点 · 01', model: 'CT15', sn: 'C15KH2661500000301', ip: 'MQTT / site-01', version: 'V2.12.01', connected: true, reachable: true, transport: 'MQTT', group: '远程站点' },
    { id: 'd8', name: '装配二线 · 02', model: 'CT13', sn: 'C13KH2661500000202', ip: '192.0.2.112', version: 'V2.10.03', connected: false, reachable: true, transport: 'LAN', group: '装配二线' },
];
export const state = {
    page: 'workspace', maxConcurrent: 2, edition: 'internal', transport: 'LAN', query: '', model: '', connection: '',
    devices: structuredClone(demoDevices), flashTargets: [], selected: new Set(), tasks: [], taskFilter: 'all', detailId: null, detailTab: 'overview',
    searchStart: '192.0.2.1', searchEnd: '192.0.2.254', searchProgress: null, remoteEnabled: false, mqttConnected: false,
    factoryStages: {}, factoryParams: {}, paramTab: 'system', paramDraft: {}, settings: {},
    factoryItems: ['eMMC', '内存', 'DO / DI', '蓝牙', 'LED', '4G模块', '子板检测'], factoryProfile: '默认测试方案', burnModel: 'CT16', burnPart: '主控', factoryStage: 'PCBA', settingsTab: 'connection',
};
state.devices.forEach((device, index) => {
    device.deviceId = `250CCDA26D29CEF132E5B83AFFBF${String(index + 1).padStart(6, '0')}`;
    device.occupied = device.id === 'd8';
    device.hwVersion = 'V1.0';
    device.sessionIp = device.connected ? '192.0.2.200' : '';
    device.parameters = Object.fromEntries(systemParameters.map(([key, _label, value]) => [key, value]));
});
export function getDevice(id) { return [...state.devices, ...state.flashTargets].find(device => device.id === id); }
export function supports(device, action) {
    if (state.edition === 'factory' && ['import', 'export', 'configure', 'files'].includes(action)) return false;
    return (profiles[device.model] || []).includes(action); }
export function visibleDevices() {
    const query = state.query.toLowerCase().trim();
    return state.devices.filter(device => device.transport === state.transport &&
        (!state.model || device.model === state.model) &&
        (!state.connection || (state.connection === 'connected' ? device.connected : !device.connected)) &&
        (!query || [device.name, device.deviceId || '', device.sn, device.ip, device.model].some(value => value.toLowerCase().includes(query))));
}
export function activeTaskFor(id) {
    return state.tasks.find(task => task.items.some(item => item.deviceId === id && ['queued', 'running', 'waiting'].includes(item.status)));
}
export function availability(device, action) {
    if (!supports(device, action)) return `${device.model} 暂不支持${capabilityLabels[action] || action}`;
    if (device.occupied) return '设备已被其他工具占用';
    if (!device.connected) return device.reachable ? '尚未连接，请先连接设备' : '设备离线';
    if (activeTaskFor(device.id)) return '设备有正在执行的任务';
    return '';
}
export function classifyTargets(ids, action) {
    return [...ids].map(id => getDevice(id)).filter(Boolean).map(device => ({ device, reason: availability(device, action) }));
}
export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
export function timeLabel(date = new Date()) {
    return date.toLocaleTimeString('zh-CN', { hour12: false });
}
