import { systemParameters } from '../core/catalog.js';
import { state, classifyTargets, getDevice, actionLabels, escapeHtml as e } from '../core/store.js';
import { icon, badge, button } from '../ui.js';

export let operation = null;
export function beginOperation(kind, ids) {
    operation = { kind, ids: [...ids], files: [], config: null, mode: 'same', skipped: new Set(), mappings: {}, demoFailure: false, label: '', error: '', scope: 'params', paramType: '系统参数', configTab: 'system', checked: new Set(), values: {}, safetyBackup: false };
}
export function targets() {
    return classifyTargets(operation.ids, operation.kind).map(entry => ({ ...entry, excluded: operation.skipped.has(entry.device.id) }));
}
export function eligible() { return targets().filter(entry => !entry.reason && !entry.excluded); }
export function validateOperation() {
    const op = operation;
    if (!eligible().length) return '没有可执行的设备，请先连接设备或调整选择。';
    if (op.kind === 'ota') {
        if (op.files[0]?.size > 10 * 1024 * 1024) return '固件大小超过最大限制 10 MB。';
        if (!op.files.length) return '请选择固件文件。';

    }
    if (op.kind === 'export' && op.scope === 'raw' && op.backupRange !== 'all' && op.backupCategories?.length === 0) return '请至少选择一个备份项。';
    if (op.kind === 'import') {
        if (!op.config) return '请选择配置文件。';
        if (op.mode === 'mapping' && eligible().some(entry => !op.mappings[entry.device.id])) return '请为每台目标设备选择配置文件。';

    }
    if (op.kind === 'activate' && !op.activationProduct) return '请先登录平台并选择产品。';
    if (op.kind === 'configure') {
        if (!op.checked.size) return '请至少选择一项参数配置。';
        if ([...op.checked].some(key => !String(op.values[key] ?? '').trim())) return '已选择的参数值不能为空。';
    }
    if (op.kind === 'import') {
        if (op.mode === 'mapping' && eligible().some(({ device }) => {
            const file = op.files.find(file => file.name === op.mappings[device.id]);
            return file?.workbook && !file.workbook[op.paramType].some(row => row.sn === device.sn);
        })) return '配置文件中未找到目标设备 SN 对应的参数行。';
    }
    return '';
}
export function operationPreview() {
    const op = operation;
    return op && ((['import', 'configure'].includes(op.kind) && (op.config || op.checked.size)) || (op.kind === 'ota' && op.files.length)) ? preview(op) : '';
}
export function operationPanel() {
    if (!operation) return '';
    const op = operation;
    const title = actionLabels[op.kind];
    const entries = targets();
    const unavailable = entries.filter(entry => entry.reason).length;
    return `<section class="operation-panel" aria-labelledby="operation-title">
    <header class="panel-heading"><h2 id="operation-title">${title}</h2><span>目标 ${op.ids.length} 台 · 可执行 ${eligible().length} 台</span></header>
    <div class="operation-editor">
    ${preparation(op)}
    <div class="inline-preview">${operationPreview()}</div>
    <section class="target-section"><div class="section-title">目标设备 <span class="muted small">已选 ${op.ids.length} 台 · 可执行 ${eligible().length} 台</span></div>
    ${unavailable ? `<div class="notice amber">${icon('info')} ${unavailable} 台设备当前不可执行，已列出原因，不会自动对它们执行操作。</div>` : ''}
    <div class="target-list">${entries.map(({ device, reason, excluded }) => `<label class="target-item"><input type="checkbox" data-target-toggle="${device.id}" ${reason ? 'disabled' : excluded ? '' : 'checked'}><div class="target-name"><b>${e(device.name)}</b><small class="mono">${e(device.sn)}</small></div>${badge(device.model, 'neutral')}<span class="target-reason ${reason ? 'warning-text' : 'success-text'}">${e(reason || (excluded ? '已排除' : '可执行'))}</span></label>`).join('')}</div></section>
    ${op.error ? `<div class="notice red" role="alert">${icon('info')}${e(op.error)}</div>` : ''}
    </div><footer class="operation-footer"><span class="small muted">执行范围：当前所选 ${op.ids.length} 台设备</span>${button(`执行${title} · ${eligible().length} 台`, 'operation-submit', 'primary', 'check')}</footer>
    </section>`;
}
function preparation(op) {
    if (op.kind === 'ota' || op.kind === 'import') {
        const isImport = op.kind === 'import';
        return `${isImport ? `<div class="import-options"><label>参数类别 <select id="import-param-type">${['系统参数', '用户参数'].map(type => `<option ${type === op.paramType ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label><input type="radio" name="import-mode" value="same" ${op.mode === 'same' ? 'checked' : ''}>统一配置</label><label><input type="radio" name="import-mode" value="mapping" ${op.mode === 'mapping' ? 'checked' : ''}>逐台分配（按 SN）</label></div>` : '<p class="muted">选择 OTA 固件；执行前需核对固件与设备是否匹配。最大 10 MB。</p>'}
        <div class="file-drop compact-file"><span class="file-label">${isImport ? '配置文件' : '固件文件'}</span><strong>${op.files.length ? e(op.files.map(file => file.name).join('、')) : '尚未选择文件'}</strong>${button('选择文件', 'choose-file', '', 'file')}<input id="operation-file" type="file" hidden ${isImport && op.mode === 'mapping' ? 'multiple' : ''} accept="${isImport ? '.xlsx,.xls' : '.bin'}"></div>
        ${isImport && op.mode === 'mapping' && op.config ? `<table class="mapping-list"><thead><tr><th>目标设备 / SN</th><th>配置文件</th></tr></thead><tbody>${eligible().map(({ device }) => `<tr><td>${e(device.sn)}</td><td><select data-map-device="${device.id}"><option value="">请选择配置文件</option>${op.files.map(file => `<option value="${e(file.name)}" ${op.mappings[device.id] === file.name ? 'selected' : ''}>${e(file.name)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table>` : ''}
        ${isImport && op.files[0]?.workbook && op.mode === 'same' ? `<label class="source-row">来源行 · SN <select id="import-source-row">${op.files[0].workbook[op.paramType].map(row => `<option ${row.sn === op.sourceSn ? 'selected' : ''}>${e(row.sn)}</option>`).join('')}</select></label>` : ''}
        ${isImport ? `<label class="check-line backup-option"><input type="checkbox" id="safety-backup" ${op.safetyBackup ? 'checked' : ''}>执行前备份目标参数</label>` : ''}`;

    }
    if (op.kind === 'configure') return `<h3>选择要配置的参数</h3><p class="muted">仅配置所选设备共有的参数。未勾选的参数保持原值。</p><div class="tabs">${[['system', '系统参数'], ['user', '应用参数']].map(([id, title]) => `<button data-action="config-tab" data-value="${id}" class="${op.configTab === id ? 'active' : ''}">${title}</button>`).join('')}</div>${op.configTab === 'user' ? '<p class="muted">所选设备没有共有的应用参数。</p>' : `<table><thead><tr><th>配置</th><th>参数</th><th>值</th></tr></thead><tbody>${systemParameters.filter(([key]) => !['wifiName', 'wifiPassword'].includes(key) || op.values.wirelessExtensionModuleType === 'wifi').map(([key, label, value]) => `<tr><td><input type="checkbox" data-config-check="${key}" ${op.checked.has(key) ? 'checked' : ''}></td><td>${label}</td><td>${key === 'wirelessExtensionModuleType' ? `<select data-config-value="${key}">${['none', '4g', '5g', 'wifi'].map(type => `<option ${type === op.values[key] ? 'selected' : ''}>${type}</option>`).join('')}</select>` : `<input data-config-value="${key}" type="${key === 'wifiPassword' ? 'password' : 'text'}" value="${e(op.values[key] ?? value)}" aria-label="${label}">`}</td></tr>`).join('')}</tbody></table>`}`;
    if (op.kind === 'export') return `<h3>配置备份</h3><label class="field-label">备份格式<select id="export-scope"><option value="params" ${op.scope === 'params' ? 'selected' : ''}>配置参数 · Excel（系统参数、用户参数）</option><option value="raw" ${op.scope === 'raw' ? 'selected' : ''}>原始数据</option></select></label>${op.scope === 'raw' ? `<label class="field-label">文件范围<select id="backup-range"><option value="selected">指定文件</option><option value="all" ${op.backupRange === 'all' ? 'selected' : ''}>全部文件（/data）</option></select></label>${op.backupRange === 'all' ? '' : ['系统参数', '子板配置', '用户参数', '机电设备配置', 'DSDK配置', '场景管理配置'].map(name => `<label class="check-line"><input type="checkbox" data-backup-category="${name}" ${!op.backupCategories || op.backupCategories.includes(name) ? 'checked' : ''}>${name}</label>`).join('')}` : ''}<p class="muted">按设备生成备份，完成后保存到本机。配置参数备份可再次用于导入。</p>`;
    if (op.kind === 'activate') return `<h3>设备激活</h3><p class="muted">登录平台并选择产品后，为选中的设备申请激活。</p><label class="field-label">平台环境<select><option>生产环境</option><option>开发环境</option><option>测试环境</option><option>部署环境</option></select></label><label class="field-label">租户<input id="activation-tenant"></label><label class="field-label">用户名<input id="activation-user"></label><label class="field-label">密码<input id="activation-password" type="password"></label>${button('登录', 'activation-login')}<label class="field-label">产品<select id="activation-product"><option value="">请先登录</option>${op.activationUser ? '<option>CT15</option><option>CT13</option><option>CT11</option>' : ''}</select></label>`;
    return `<div class="notice amber">${icon('refresh')}将重启所选设备，设备会暂时断开连接。请确认当前没有需要保存的工作。</div>`;
}
function preview(op) {
    const selected = eligible().find(entry => entry.device.id === op.previewId)?.device || eligible()[0]?.device;
    const config = op.mode === 'mapping' ? op.files.find(file => file.name === op.mappings[selected?.id])?.config : op.config;
    const mappedFile = op.files.find(file => file.name === op.mappings[selected?.id]);
    const params = (op.mode === 'mapping' && mappedFile?.workbook ? mappedFile.workbook[op.paramType].find(row => row.sn === selected?.sn)?.parameters : config?.parameters) || systemParameters.filter(([key]) => op.checked.has(key)).map(([key, label]) => ({ key, label, value: op.values[key] }));
    const current = { ...getDevice(selected?.id)?.parameters };
    const needsFile = ['import', 'ota'].includes(op.kind);
    return `<h3>执行前检查</h3>
    <div class="check-summary">${needsFile ? badge(op.kind === 'ota' ? '已选择固件' : 'Excel 表结构已检查', 'neutral') : ''}${badge(`${eligible().length} 台设备可执行`, 'green')}</div>
    ${['import', 'configure'].includes(op.kind) ? `<label class="field-label">查看设备<select id="preview-device">${eligible().map(({ device }) => `<option value="${device.id}" ${device.id === selected?.id ? 'selected' : ''}>${e(device.name)} · ${e(device.sn)}</option>`).join('')}</select></label><table class="preview-table"><thead><tr><th>参数</th><th>设备当前值</th><th>将写入的值</th></tr></thead><tbody>${params.map(param => `<tr><td>${e(param.label)}</td><td class="muted">${e(current[param.key] || '—')}</td><td class="changed-value">${e(param.value)}</td></tr>`).join('')}</tbody></table><p class="small muted">${op.mode === 'mapping' ? '选择设备查看对应的参数变更。' : '各设备执行前分别读取当前值；相同值无需重复写入。'}</p>
    ${op.mode === 'mapping' ? eligible().map(({ device }) => `<div class="summary-row"><span>${e(device.name)}</span><b>${e(op.mappings[device.id])}</b></div>`).join('') : ''}` : `<div class="summary-box"><div class="summary-row"><span>操作内容</span><b>${actionLabels[op.kind]}</b></div><div class="summary-row"><span>${op.kind === 'ota' ? '固件文件' : '目标范围'}</span><b>${e(op.files[0]?.name || `${eligible().length} 台设备`)}</b></div><div class="summary-row"><span>执行方式</span><b>逐台跟踪 · 最多 ${state.maxConcurrent} 台并发</b></div></div>`}`;
}
