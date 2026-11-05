import { systemParameters } from './catalog.js';

// 仅用于浏览器评审；正式 Qt 程序继续使用 QXlsx。保持现有工作表、表头、SN 行结构。
export function readWorkbook(data) {
    const excel = window.XLSX;
    const workbook = excel.read(data, { type: 'array', cellFormula: false, bookVBA: false });
    const result = {};
    for (const name of ['系统参数', '用户参数']) {
        if (!workbook.Sheets[name]) throw new Error('配置文件必须包含“系统参数”和“用户参数”工作表');
        const rows = excel.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false });
        const headers = rows[0] || [];
        result[name] = rows.slice(1).filter(row => row[0]).map(row => ({
            sn: String(row[0]), parameters: headers.slice(1).map((label, index) => ({
                key: systemParameters.find(([, name]) => name === label)?.[0] || String(label),
                label: String(label), value: String(row[index + 1] ?? ''),
            })).filter(param => param.label && param.label.toLowerCase() !== 'mac地址'),
        }));
    }
    return result;
}
export function writeWorkbook(devices) {
    const excel = window.XLSX;
    const book = excel.utils.book_new();
    excel.utils.book_append_sheet(book, excel.utils.aoa_to_sheet([
        ['设备名称', ...systemParameters.map(([, label]) => label)],
        ...devices.map(device => [device.sn, ...systemParameters.map(([key]) => device.parameters?.[key] || '')]),
    ]), '系统参数');
    excel.utils.book_append_sheet(book, excel.utils.aoa_to_sheet([['设备名称'], ...devices.map(device => [device.sn])]), '用户参数');
    return excel.write(book, { type: 'array', bookType: 'xlsx' });
}
