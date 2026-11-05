import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// 各分支只导出静态资源，不运行分支中的构建脚本。
const output = resolve(process.argv[2] || '_site');
const prefix = process.argv[3] || 'refs/remotes/origin/';
const git = args => execFileSync('git', args, { encoding: 'utf8' }).trim();
const branches = git(['for-each-ref', '--format=%(refname)', prefix]).split('\n')
    .filter(ref => ref.startsWith(prefix))
    .map(ref => ({ ref, name: ref.slice(prefix.length) }))
    .filter(({ name }) => name === 'main' || /^design-v[0-9][A-Za-z0-9._-]*$/.test(name))
    .sort((a, b) => a.name === 'main' ? -1 : b.name === 'main' ? 1 : a.name.localeCompare(b.name, 'en', { numeric: true }));
if (!branches.some(branch => branch.name === 'main')) throw new Error('The main branch is required');
await mkdir(output, { recursive: true });
for (const { ref, name } of branches) {
    const files = git(['ls-tree', '-r', '--name-only', ref]).split('\n');
    if (!files.includes('index.html') || !files.some(file => file.startsWith('src/'))) throw new Error(`Missing prototype entry or source: ${name}`);
    const paths = ['index.html', 'src', 'third_party', 'docs/fixtures']
        .filter(path => files.some(file => file === path || file.startsWith(`${path}/`)));
    const archive = execFileSync('git', ['archive', '--format=tar', ref, ...paths], { maxBuffer: 64 * 1024 * 1024 });
    const target = resolve(output, name);
    await mkdir(target, { recursive: true });
    execFileSync('tar', ['-xf', '-', '-C', target], { input: archive });
}
await writeFile(resolve(output, '.nojekyll'), '');
await writeFile(resolve(output, 'index.html'), `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CCTools 界面设计评审</title>
<style>body{font:15px/1.7 system-ui,sans-serif;max-width:900px;margin:50px auto;padding:0 24px;color:#243449}h1{font-size:25px}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #dce2e8}a{color:#245d8d}small{color:#64748b}</style>
<h1>CCTools 界面设计评审</h1><p>选择设计分支和工具版本，分别查看不同方案。</p><table><thead><tr><th>设计分支</th><th>内测版</th><th>发行版</th><th>工厂版</th></tr></thead><tbody>
${branches.map(({ name }) => `<tr><td>${name}${name === 'main' ? ' <small>当前方案</small>' : ''}</td>${['internal', 'release', 'factory'].map(edition => `<td><a href="./${name}/?edition=${edition}">打开预览</a></td>`).join('')}</tr>`).join('\n')}
</tbody></table></html>\n`);
console.log(`Prepared ${branches.length} branch previews in ${output}`);
