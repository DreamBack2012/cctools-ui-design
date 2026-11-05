import { escapeHtml } from './core/store.js';

const icons = {
    devices: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    tasks: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10l1 1 2-2m2 1h2m-7 6 1 1 2-2m2 1h2"/>',
    burn: '<path d="M13 2s2 5-1 8c-1-3-3-4-3-4s1 4-2 7a7 7 0 1 0 11-1c1 4-2 5-2 5s2-8-3-15Z"/>',
    factory: '<path d="M3 21V9l6 3V7l6 3V3h4l2 18H3Zm3-5h1m4 0h1m4 0h1"/>',
    settings: '<path d="m10 3-1 3-3 1-2-1-2 4 2 2v3l-2 2 2 4 3-1 2 1 1 2h4l1-3 3-1 2 1 2-4-2-2v-3l2-2-2-4-3 1-2-1-1-2Z" transform="translate(0 -1) scale(.95)"/><circle cx="12" cy="12" r="3"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
    download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5"/>',
    refresh: '<path d="M20 7a9 9 0 1 0 1 9M20 3v5h-5"/>',
    connect: '<path d="m9 8 7 7m-8-6-4 4a4 4 0 0 0 6 6l4-4m-4-5 4-4a4 4 0 0 1 6 6l-4 4"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    terminal: '<path d="m5 7 5 5-5 5m8 0h6"/><rect x="2" y="3" width="20" height="18" rx="2"/>',
    file: '<path d="M4 3h10l6 6v12H4V3Zm10 0v6h6M8 13h8m-8 4h6"/>',
    shield: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6l9-4Z"/><path d="m8 12 3 3 5-6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    cloud: '<path d="M6 18a5 5 0 1 1 1-10 6 6 0 0 1 12 2 4 4 0 0 1-1 8H6Z"/>',
    book: '<path d="M12 5v16M3 3c4-1 7 0 9 2 2-2 5-3 9-2v16c-4-1-7 0-9 2-2-2-5-3-9-2V3Z"/>',
};
export function icon(name, size = 18) { return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.devices}</svg>`; }
export function badge(label, tone = '') { return `<span class="badge ${tone}">${escapeHtml(label)}</span>`; }
export function button(label, action, cls = '', glyph = '', attributes = '') {
    return `<button class="btn ${cls}" data-action="${action}" ${attributes}>${glyph ? icon(glyph) : ''}${label}</button>`;
}
export function empty(title, text, glyph = 'tasks') {
    return `<div class="empty">${icon(glyph, 32)}<h3>${title}</h3><p>${text}</p></div>`;
}
export function download(filename, content, mime = 'text/plain;charset=utf-8') {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
