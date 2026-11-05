import { factoryItems } from './catalog.js';

// 对应 FactoryTestProfile 的 v1 格式；该兼容密钥不是设备会话密钥。
const MAGIC = new TextEncoder().encode('CCTFPR01');
const KEY = new Uint8Array([0xd4, 0x7a, 0x31, 0xb8, 0x25, 0x6c, 0xe9, 0x10, 0x83, 0x5f, 0xa2,
    0x49, 0xc0, 0x76, 0x1d, 0xeb, 0x92, 0x08, 0x67, 0xcc, 0x4a, 0xf1,
    0x35, 0x9e, 0x58, 0xb3, 0x0f, 0x72, 0xad, 0x46, 0x81, 0x2c]);
const parameterKeys = {
    bluetooth: 'factory/bluetooth_version', mainVersion: 'factory/ver_main', subVersion: 'factory/ver_sub',
    subModules: 'factory/sub_module_info', ssid: 'factory/wifi_ssid', password: 'factory/wifi_password',
};
const stages = ['PCBA', '整机', '老化'];
const invalid = () => new Error('测试项文件无效、版本不支持或内容被修改');

// Qt 5.14 QDataStream：大端整数、UTF-16 字符串与 QVariant(QString / QStringList)。
class Stream {
    constructor(bytes = []) { this.bytes = Array.from(bytes); this.offset = 0; }
    number(value, count) {
        if (value !== undefined) {
            let number = BigInt(value);
            const bytes = new Array(count);
            for (let index = count - 1; index >= 0; index--) { bytes[index] = Number(number & 255n); number >>= 8n; }
            this.bytes.push(...bytes); return value;
        }
        if (this.offset + count > this.bytes.length) throw invalid();
        let number = 0n;
        for (let index = 0; index < count; index++) number = (number << 8n) | BigInt(this.bytes[this.offset++]);
        return count === 8 ? number : Number(number);
    }
    string(value) {
        if (value !== undefined) {
            this.number(value.length * 2, 4);
            for (let index = 0; index < value.length; index++) this.number(value.charCodeAt(index), 2);
            return value;
        }
        const length = this.number(undefined, 4);
        if (length === 0xffffffff) return '';
        if (length % 2 || length > 65536 || this.offset + length > this.bytes.length) throw invalid();
        let result = '';
        for (let index = 0; index < length; index += 2) result += String.fromCharCode(this.number(undefined, 2));
        return result;
    }
}
function validate(profile) {
    const date = profile.batchDate;
    if (!/^\d{12}$/.test(date)) throw invalid();
    const parsed = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T${date.slice(8, 10)}:${date.slice(10)}:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().replace(/\D/g, '').slice(0, 12) !== date) throw invalid();
    for (const stage of stages) if (!Array.isArray(profile.stages[stage]) || profile.stages[stage].some(item => !factoryItems.includes(item))) throw invalid();
    for (const [key, value] of Object.entries(profile.params)) {
        const limit = ['bluetooth', 'ssid', 'password'].includes(key) ? 63 : 255;
        if (typeof value !== 'string' || value.includes('\0') || new TextEncoder().encode(value).length > limit) throw invalid();
    }
    const subModules = profile.params.subModules ? profile.params.subModules.split(',') : [];
    if (subModules.length > 32 || subModules.some(value => !/^(?:[0-9]|1[0-9]|2[0-3])$/.test(value))) throw invalid();
}
async function key() { return crypto.subtle.importKey('raw', KEY, 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function encodeFactoryProfile(profile) {
    validate(profile);
    const stream = new Stream(); stream.number(1, 4); stream.string(profile.batchDate);
    for (const stage of stages) stream.number(profile.stages[stage].reduce((mask, item) => mask | (1n << BigInt(factoryItems.indexOf(item))), 0n), 8);
    const entries = Object.entries(parameterKeys).sort((left, right) => left[1].localeCompare(right[1]));
    stream.number(entries.length, 4);
    for (const [name, fullKey] of entries) {
        stream.string(fullKey); stream.number(name === 'subModules' ? 11 : 10, 4); stream.number(0, 1);
        if (name === 'subModules') {
            const values = profile.params[name] ? profile.params[name].split(',') : [];
            stream.number(values.length, 4); values.forEach(value => stream.string(value));
        } else stream.string(profile.params[name] || '');
    }
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: MAGIC, tagLength: 128 }, await key(), new Uint8Array(stream.bytes));
    return new Uint8Array([...MAGIC, ...nonce, ...new Uint8Array(encrypted)]);
}
export async function decodeFactoryProfile(bytes) {
    if (bytes.length > 65536 || bytes.length <= 36 || !MAGIC.every((byte, index) => bytes[index] === byte)) throw invalid();
    let plain;
    try {
        plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(8, 20), additionalData: MAGIC, tagLength: 128 }, await key(), bytes.slice(20));
    } catch { throw invalid(); }
    const stream = new Stream(new Uint8Array(plain));
    if (stream.number(undefined, 4) !== 1) throw invalid();
    const profile = { batchDate: stream.string(), stages: {}, params: {} };
    for (const stage of stages) {
        const mask = stream.number(undefined, 8);
        if ((mask >> 23n) !== 0n) throw invalid();
        profile.stages[stage] = factoryItems.filter((_, index) => (mask & (1n << BigInt(index))) !== 0n);
    }
    if (stream.number(undefined, 4) !== 6) throw invalid();
    for (let index = 0; index < 6; index++) {
        const fullKey = stream.string();
        const name = Object.keys(parameterKeys).find(name => parameterKeys[name] === fullKey);
        if (!name || Object.hasOwn(profile.params, name)) throw invalid();
        const type = stream.number(undefined, 4);
        if (stream.number(undefined, 1) > 1 || type !== (name === 'subModules' ? 11 : 10)) throw invalid();
        if (type === 11) {
            const count = stream.number(undefined, 4);
            if (count > 32) throw invalid();
            profile.params[name] = Array.from({ length: count }, () => stream.string()).join(',');
        } else profile.params[name] = stream.string();
    }
    if (stream.offset !== stream.bytes.length) throw invalid();
    validate(profile); return profile;
}
