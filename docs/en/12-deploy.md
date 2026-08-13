# VitePress + GitHub Pages Deployment

> This very tutorial site is deployed this way — this chapter shows you how to put it (and any VitePress docs site) live on GitHub Pages.

## Why VitePress

- **Content is Markdown**: code, tables, and callouts all first-class
- **Code imports**: `<<< ../../mini-dsh/src/context.ts` embeds the real source into the docs — **the code never drifts**
- **Great i18n experience**: built-in locale support, local search, dark/light themes, mobile-ready
- **Static site**: the build output is plain HTML, hosted free on GitHub Pages

## 1. Initialize

At the project root:

```bash
npm init -y
npm install -D vitepress
mkdir docs
```

Add scripts to `package.json`:

```json
{
  "scripts": {
    "docs:dev": "vitepress dev docs",
    "docs:build": "vitepress build docs",
    "docs:preview": "vitepress preview docs"
  }
}
```

## 2. Configuration (mind the base!)

`docs/.vitepress/config.mts` — **the most important thing is `base`**: it must equal "the repo name", or every asset 404s after deploy:

```ts
import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "zh-CN",                    // default language
  title: "从零实现 DeepSeek Harness",
  base: "/deepseek-harness-tutorial/",   // ← repo name, trailing slash required

  locales: {                        // bilingual: zh default, /en/ for English
    root: { label: "中文", lang: "zh-CN" },
    en: { label: "English", lang: "en" },
  },

  themeConfig: {
    // per-locale nav / sidebar / labels go in themeConfig.locales
    locales: {
      root: { label: "中文", nav: [...], sidebar: [...zh...], outline: { label: "本页目录" } },
      en: { label: "English", nav: [...], sidebar: [...en...], outline: { label: "On this page" } },
    },
    search: { provider: "local", options: { locales: { "zh-CN": {...}, en: {...} } } },
    editLink: { pattern: "https://github.com/you/repo/edit/main/docs/:path", text: "Edit this page on GitHub" },
  },
});
```

::: warning The base pitfall
- Locally the URL is `http://127.0.0.1:5173/deepseek-harness-tutorial/...`
- Static assets (images, logo) also need the base prefix (or relative paths)
- If you ever move to a custom domain, remove `base`
:::

## 3. Deploy: GitHub Actions

`.github/workflows/deploy-pages.yml` — the official Pages trio (configure-pages / upload-pages-artifact / deploy-pages):

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
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run docs:build
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

## 4. Enable Pages and Push

1. Push the code to GitHub (`main` branch)
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**
3. The workflow builds and deploys automatically

::: tip Repo & workflow files pitfall
GitHub's OAuth token may lack `workflow` scope, and pushes that touch `.github/workflows/` get rejected. **Switch to SSH** (`git remote set-url origin git@github.com:user/repo.git`) to bypass it.
:::

## 5. Verify

```bash
# local build (a failed build = dead links or syntax errors in the docs — a free check)
npm run docs:build

# local preview
npm run docs:preview
# → http://127.0.0.1:4173/deepseek-harness-tutorial/

# after deploy
curl -s https://USER.github.io/REPO/ | head
```

## Advanced

| Need | How |
|---|---|
| Custom domain | Repo Settings → Pages → Custom domain, add a CNAME record |
| 404 page | Put a `404.html` in the repo root (copy `docs/.vitepress/dist/404.html`) |
| Comments | Integrate Giscus (GitHub Discussions, zero backend) |
| Search | `search: { provider: "local" }` works out of the box, Chinese included |
| Per-page edit links | `editLink` points at the repo; readers submit a PR for typos in one click |

::: tip Recap
- `base` = repo name, the most ignored pitfall
- The official Pages trio workflow: configure once, auto-deploy forever
- Build = check: `docs:build` catches dead links and syntax errors for you

End of the tutorial. Next: [Appendix: Mapping to the Official Codebase →](reference/mapping)
:::
