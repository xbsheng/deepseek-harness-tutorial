# VitePress + GitHub Pages 部署

> 本教程站本身就是这样部署的 —— 这一章教你把它(以及任何 VitePress 文档站)上线到 GitHub Pages。

## 为什么是 VitePress

- **内容即 Markdown**:教程代码、表格、提示框都原生支持
- **代码导入**:`<<< ../mini-dsh/src/context.ts` 直接把真实源码嵌进文档 —— **代码永不漂移**
- **中文体验好**:本地搜索、深浅主题、移动端适配开箱即用
- **静态站**:构建产物是纯 HTML,免费托管在 GitHub Pages

## 1. 初始化

在项目根目录:

```bash
pnpm init
pnpm add -D vitepress
mkdir docs
```

`package.json` 加脚本:

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

## 2. 配置(注意 base!)

`docs/.vitepress/config.mts` —— **最关键的是 `base`**,必须等于「仓库名」,否则部署后资源全部 404:

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",
  title: "从零实现 DeepSeek Harness",
  base: "/deepseek-harness-tutorial/",   // ← 仓库名,末尾斜杠必须有

  themeConfig: {
    nav: [...],
    sidebar: [...],      // 章节导航
    outline: { label: "本页目录" },
    search: { provider: "local" },   // 本地全文搜索
    docFooter: { prev: "上一篇", next: "下一篇" },
    editLink: { pattern: "https://github.com/你/仓库/edit/main/docs/:path", text: "在 GitHub 上编辑此页" },
  },
});
```

::: warning base 的坑
- 本地预览时路径是 `http://127.0.0.1:5173/deepseek-harness-tutorial/...`
- 图片、logo 等静态资源路径**也要带 base 前缀**(或用相对路径)
- 如果你的站点将来要放自定义域名,再移除 base
:::

## 3. 部署:GitHub Actions

`.github/workflows/deploy-pages.yml` —— 用官方 Pages 三件套(configure-pages / upload-pages-artifact / deploy-pages):

```yaml
name: Deploy VitePress site to Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm docs:build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: docs/.vitepress/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

## 4. 开启 Pages 并推送

1. 推送代码到 GitHub(`main` 分支)
2. 仓库 **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. 工作流自动构建并部署

::: tip 仓库与工作流文件的坑
GitHub 的 OAuth token 可能没有 `workflow` 权限,推送含 `.github/workflows/` 的提交会被拒绝。**改用 SSH 方式推送**(`git remote set-url origin git@github.com:user/repo.git`)即可绕过。
:::

## 5. 验证

```bash
# 本地构建(构建失败 = 文档有死链或语法错误,这是免费的检查)
pnpm docs:build

# 本地预览
pnpm docs:preview
# → http://127.0.0.1:4173/deepseek-harness-tutorial/

# 部署后
curl -s https://USER.github.io/REPO/ | head
```

## 进阶玩法

| 需求 | 做法 |
|---|---|
| 自定义域名 | 仓库 Settings → Pages → Custom domain,加 CNAME 记录 |
| 404 页 | 仓库根放一个 `404.html`(可复制 `docs/.vitepress/dist/404.html`) |
| 评论系统 | 集成 Giscus(基于 GitHub Discussions,零后端) |
| 搜索 | `search: { provider: "local" }` 开箱即用,支持中文 |
| 每页编辑链接 | `editLink` 指向仓库,读者一键提 PR 改错别字 |

::: tip 本章回顾
- `base` = 仓库名,最容易被忽略的坑
- 官方 Pages 三件套工作流,一次配置永久自动部署
- 构建即检查:`docs:build` 帮你抓死链和语法错误

全教程完。下一步:[附录:与官方架构对照 →](reference/mapping)
:::
