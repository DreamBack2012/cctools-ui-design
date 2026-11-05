# GitHub 设计预览配置

## 仓库与分支

建议仓库名为 `cctools-ui-design`。首次使用公开仓库，便于通过 GitHub Pages 分享评审。

- `main`：当前方案，同时维护发布脚本。
- `design-v1`、`design-v2`：独立设计方案。
- 设计分支使用 `design-v` 加数字开头，后续可使用数字、英文字母、点、下划线、短横线。
- 每个设计分支内部仍提供内测版、发行版、工厂版预览，不用按软件版本再拆分分支。

GitHub Pages 一个仓库只有一个站点。本工程用 GitHub Actions 将各分支的静态资源分别导出到站点子目录，实现多个方案同时访问。

## 首次配置

1. 在 GitHub 创建 `cctools-ui-design` 仓库。若准备推送本地已有工程，不勾选初始化 README、许可证和 `.gitignore`。
2. 将本工程提交并推送到 `main`，必须包含 `.github/workflows/pages.yml` 和 `script/build-pages.mjs`。
3. 进入仓库 **Settings → Pages → Build and deployment → Source**，选择 **GitHub Actions**。
4. 进入 **Actions → Publish design previews → Run workflow**，选择 `main`，点击运行。后续推送会自动部署。
5. 等待任务成功，在 **Settings → Pages** 查看发布地址。

若 Actions 被禁用，先在 **Settings → Actions → General** 中允许本工作流使用的 GitHub 官方 Actions。
不需要申请令牌、设置仓库密钥，也不需要安装 npm 依赖。

公开仓库的 Pages 预览可被外部访问，不要上传真实凭据或客户数据。私有仓库的 Pages 可用性与访问控制取决于 GitHub 套餐及组织策略，不能将私有仓库等同于私有预览。

## 访问地址

假设 GitHub 账号为 `your-name`：

| 内容 | 地址 |
| --- | --- |
| 所有方案目录 | `https://your-name.github.io/cctools-ui-design/` |
| 当前方案 | `https://your-name.github.io/cctools-ui-design/main/` |
| 方案一 | `https://your-name.github.io/cctools-ui-design/design-v1/` |
| 方案二 | `https://your-name.github.io/cctools-ui-design/design-v2/` |
| 方案二发行版 | `https://your-name.github.io/cctools-ui-design/design-v2/?edition=release` |
| 方案二工厂版 | `https://your-name.github.io/cctools-ui-design/design-v2/?edition=factory` |

根目录会自动列出所有符合命名规则的设计分支，并提供三个工具版本的入口。

## 增加或更新方案

在需要保留的设计提交处创建分支并推送，例如：

```bash
git switch -c design-v1
git push -u origin design-v1
```

在另一方案中修改代码，按自己的工作流程提交，然后正常推送对应分支。
不需要合并到 `main` 才能预览，也不需要在 Pages 设置中反复切换发布分支。
每次部署重新收集全部设计分支，保留其他方案的预览。删除远端设计分支后，自动部署会移除对应入口；也可手动运行工作流刷新。

本地工程目录与建议的 GitHub 仓库名均为 `cctools-ui-design`。

## 常见问题

- **推送后没有预览**：检查 Pages 的 Source 是否为 GitHub Actions，并检查 Actions 的失败步骤。首次选择 Source 后可手动运行工作流。
- **分支没有显示**：确认已推送到远端且名称符合 `design-v1` 等规则；仅在本地创建分支不会发布。
- **页面未更新**：等待最新部署完成，刷新或按 `Ctrl+F5`。
- **页面存在但资源 404**：检查该分支是否保留 `index.html`、`src/` 及所需 `third_party/`，资源引用使用相对路径，不能写死站点根路径。
- **修改发布流程不生效**：工作流统一从 `main` 读取，发布配置需要在 `main` 更新。

## 本地检查发布目录

已存在本地提交和分支时，从工程根目录执行：

```bash
node script/build-pages.mjs _site refs/heads/
python3 -m http.server 4174 --bind 127.0.0.1 --directory _site
```

第二条命令需要 Python 3，访问 `http://localhost:4174/` 查看方案目录。
本地检查不会执行 GitHub 发布；`_site/` 是生成目录，不提交。
