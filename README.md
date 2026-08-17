# 从零实现 DeepSeek Harness

[English](README.en.md) | 中文

基于最新开源的 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)(2026-08-13 开源,MIT),从零到一实现一个包含核心功能的**简易版智能体框架** —— **mini-dsh** 的完整中文教程。

📖 教程站: <https://xbsheng.github.io/deepseek-harness-tutorial/>

## 仓库结构

```
├── docs/          # VitePress 教程站(中文默认 + /en/ 英文版,11 章 + 附录)
├── mini-dsh/      # 简易版实现(TS,零运行时依赖,25 个测试全绿)
│   ├── src/       # 核心库:插件系统/会话日志/LLM 缝隙/工具系统/Agent 循环/SSE Web UI
│   ├── plugins/   # 示例插件:提示词/Shell/文件(沙箱)/技能
│   ├── boot.ts    # 组装(profile 思想)
│   └── test/      # vitest 测试
└── .github/workflows/deploy-pages.yml  # 自动部署到 GitHub Pages
```

## mini-dsh 快速开始

```bash
# pnpm 工作区:根目录一次安装,同时装好 docs 与 mini-dsh
pnpm install

cd mini-dsh
pnpm test          # 25/25 测试
pnpm run demo      # 脚本化端到端演示(无需 API key)

export DEEPSEEK_API_KEY=sk-xxx
pnpm chat          # 交互式 REPL
pnpm run run "帮我写一个冒泡排序"   # 一次性任务
pnpm web           # 浏览器 UI(默认 3080 端口,SSE 流式输出)
```

## 教程章节

1. [序章:认识 DeepSeek Harness](docs/01-about.md)
2. [环境准备与项目骨架](docs/02-setup.md)
3. [核心一:插件系统 mini-Cordis](docs/03-plugin.md)
4. [核心二:会话事件日志](docs/04-session.md)
5. [核心三:LLM 适配器缝隙](docs/05-llm.md)
6. [核心四:工具系统](docs/06-tools.md)
7. [核心五:Agent 循环](docs/07-agent.md)
8. [示例插件:提示词/Shell/文件/技能](docs/08-plugins.md)
9. [CLI 与启动](docs/09-cli.md)
10. [测试与验证](docs/10-test.md)
11. [可选:Web UI](docs/11-web.md)
12. [附录:与官方架构对照](docs/reference/mapping.md)

## 免责声明

本仓库是**独立教学项目**,与 DeepSeek 官方无隶属关系。`mini-dsh` 是「概念同构的简化实现」,并非官方代码的搬运。

MIT License
