# Build DeepSeek Harness from Scratch

[中文](README.md) | English

A complete Chinese tutorial (with this English version) that walks you through building a **simplified agent harness** — **mini-dsh** — from zero to one, based on the recently open-sourced [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (open-sourced 2026-08-13, MIT).

📖 Tutorial site: **https://xbsheng.github.io/deepseek-harness-tutorial/** (Chinese by default · [English Version](https://xbsheng.github.io/deepseek-harness-tutorial/en/))

## Repository Layout

```
├── docs/          # VitePress tutorial site (Chinese default + /en/ English, 12 chapters + appendix)
├── mini-dsh/      # The simplified implementation (TS, zero runtime deps, 25 tests all green)
│   ├── src/       # Core: plugin system / session log / LLM seam / tools / agent loop / SSE Web UI
│   ├── plugins/   # Example plugins: prompt / Shell / sandboxed FS / skills
│   ├── boot.ts    # Assembly (the profile idea)
│   └── test/      # vitest tests
└── .github/workflows/deploy-pages.yml  # Auto-deploy to GitHub Pages
```

## mini-dsh Quick Start

```bash
# pnpm workspace: one install at the root covers both docs and mini-dsh
pnpm install

cd mini-dsh
pnpm test          # 25/25 tests
pnpm run demo      # scripted end-to-end demo (no API key needed)

export DEEPSEEK_API_KEY=sk-xxx
pnpm chat          # interactive REPL
pnpm run run "write a bubble sort for me"   # one-shot task
pnpm web           # browser UI (default port 3080, SSE streaming output)
```

## Tutorial Chapters

1. [About DeepSeek Harness](docs/en/01-about.md)
2. [Setup & Project Skeleton](docs/en/02-setup.md)
3. [Core 1: Plugin System (mini-Cordis)](docs/en/03-plugin.md)
4. [Core 2: Session Event Log](docs/en/04-session.md)
5. [Core 3: LLM Adapter Seam](docs/en/05-llm.md)
6. [Core 4: Tool System](docs/en/06-tools.md)
7. [Core 5: Agent Loop](docs/en/07-agent.md)
8. [Example Plugins: Prompt/Shell/FS/Skills](docs/en/08-plugins.md)
9. [CLI & Startup](docs/en/09-cli.md)
10. [Testing & Verification](docs/en/10-test.md)
11. [Web UI (SSE Streaming)](docs/en/11-web.md)
12. [VitePress + GitHub Pages Deployment](docs/en/12-deploy.md)
13. [Appendix: Mapping to the Official Codebase](docs/en/reference/mapping.md)

## Disclaimer

This repository is an **independent teaching project** with no affiliation to DeepSeek. `mini-dsh` is a "concept-isomorphic simplified implementation", not a copy of the official code.

MIT License
