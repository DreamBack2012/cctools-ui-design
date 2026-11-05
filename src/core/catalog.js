// 对应正式仓库 DeviceDiscoveryView、BatchConfigData、FirmwareBurnProfile 与 FactoryTestModel。
export const systemParameters = [
    ['sntpAddr', '时间服务器地址', 'pool.ntp.org'],
    ['gateway', '网关地址', '192.0.2.1'],
    ['mask', '子网掩码', '255.255.255.0'],
    ['vendor', '厂商名称', 'OpenValley'],
    ['projectName', '项目名称', ''],
    ['esbRegionName', '软总线分区名称', 'default'],
    ['activeNetworkingEnable', '主动组网使能', '0'],
    ['wirelessExtensionModuleType', '无线扩展模块类型', 'none'],
    ['wifiName', 'wifi名称', ''],
    ['wifiPassword', 'wifi密码', ''],
];
export const factoryItems = ['内部Flash', 'SPIFlash', 'EEPROM', 'SDNAND', 'eMMC', '内存', 'RO / DI',
    'DO / DI', 'AO / AI', 'CAN总线', 'RS232', 'RS485', '蓝牙', '治具电压', 'RTC', 'LED',
    '4G模块', '5G模块', '版本校验', '子板检测', 'NMEA', '加密芯片', 'WiFi'];
const jlinkSub = { label: '子板', backend: 'J-Link', interface: null, accept: '.bin' };
const espBluetooth = { label: '蓝牙', backend: 'ESP32-S3', interface: 'serial', accept: '.bin' };
const sparklink = { label: '星闪', backend: 'BurnTool', interface: 'serial', accept: '.fwpkg' };
export const burnProfiles = {
    CT11: [{ label: '主控', backend: 'J-Link', interface: null, accept: '.bin' },
        { label: '蓝牙', backend: 'nRF52832 / J-Link', interface: null, accept: '.hex' }],
    CT13: [{ label: '主控', backend: 'HPM', interface: 'hpm', accept: '.bin' }, jlinkSub, espBluetooth, sparklink],
    CT15: [{ label: '主控', backend: 'HPM', interface: 'hpm', accept: '.bin' }, jlinkSub, espBluetooth, sparklink],
    CT16: [{ label: '主控', backend: 'Rockchip', interface: 'rockusb', accept: '.img' }, jlinkSub,
        { label: '蓝牙/星闪', backend: 'BurnTool / HI3863', interface: 'serial', accept: '.bin,.fwpkg' },
        { label: 'WiFi', backend: 'ESP32-S3', interface: 'serial', accept: '.bin' }],
};
export function validateSearch(startIp, endIp) {
    const validIp = ip => typeof ip === 'string' && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
        ip.split('.').every(part => Number(part) <= 255);
    if (!validIp(startIp)) return '请输入有效的起始 IPv4 地址';
    if (!validIp(endIp)) return '请输入有效的结束 IPv4 地址';
    const addressValue = ip => ip.split('.').reduce((value, part) => value * 256 + Number(part), 0);
    if (addressValue(endIp) < addressValue(startIp)) return '结束地址不能小于起始地址';
    return '';
}
