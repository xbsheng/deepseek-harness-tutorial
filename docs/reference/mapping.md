# 附录:与官方架构对照

这张表帮你把 mini-dsh 学到的每一个概念映射回官方仓库 —— 学完本教程,你已经能读懂 `deepseek-ai/deepseek-harness` 的大半结构。

## 概念对照

| 官方概念 | 官方位置 | mini-dsh | 差异说明 |
|---|---|---|---|
| Cordis 插件框架 | `vendor/`(vendored Cordis 源码) | `src/context.ts` | 语义对齐;waterfall 简化为单值传递 |
| 服务仓库 `ctx.<key>` | `packages/core/*` | `ctx.service()/get()` | 官方用声明合并实现类型安全,mini 用泛型 |
| 会话事件日志 | `packages/core/session` | `src/session.ts` | 事件类型子集;官方有投影/回放/分叉 |
| system prompt 组装 | `packages/core/system-prompt` | `SystemPrompt`(在 agent.ts) | 官方还组装工具 schema 进提示词 |
| 工具注册表与管线 | `packages/core/tools` | `src/tools.ts` | 事件名一致(`tools/pre-execute` 等) |
| Agent 循环 | `packages/core/agent-loop` | `src/agent.ts` | turn/step 语义一致,事件子集 |
| LLM 缝隙 | `packages/llm/llm` + `llm-deepseek` | `src/llm.ts` | 同为 OpenAI 兼容 chat/completions + SSE |
| 技能 | `packages/skill` | `plugins/skills.ts` | 官方有 catalog/loader 工具,mini 简化为两个工具 |
| Shell 能力 | `packages/shell` | `plugins/shell.ts` | 官方走 subprocess/sandbox 服务链 |
| 文件系统 | `packages/fs` | `plugins/filesystem.ts` | 官方支持策略事件 `fs/*`,mini 内联在工具里 |
| Profile/Bundle | `packages/bundle/*` | `boot.ts` | 官方是 YAML 组合 + patch 覆盖层 |
| 沙箱 | `packages/sandbox` / `e2b` | 未实现 | 教学版明确不做,生产必须补 |
| Web UI | `apps/web` | `src/web.ts` | 零依赖单页版 |
| CLI | `apps/cli` | `src/cli.ts` | `chat`/`run`/`web` 三形态 |

## 事件对照

| 官方事件 | 分发模式 | mini-dsh | 说明 |
|---|---|---|---|
| `agent/request` | waterfall | ✅ 同款 | 请求可改写 |
| `agent/pre-step` | waterfall | ⏭ 合并 | 用 agent/request 覆盖核心场景 |
| `agent/turn-stopping` | serial | ⏭ 简化 | maxSteps 兜底 |
| `tools/pre-execute` / `post-execute` | waterfall | ✅ 同款 | 策略拦截点 |
| `tools/execute` | emit | ✅ 同款 | 审计观察点 |
| `assistant/chunk` | emit | ✅ 同款 | UI 流式渲染 |
| `llm/stream` | 生成器 | ✅ 同款 | 词汇一致 |

## 官方 turn flow 完整版 vs mini

```text
官方:
turn/start
  agent/pre-step(可拒绝/改写输入)
  step/start
    agent/request -> llm/stream -> assistant/chunk* -> assistant/message
    tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
  step/end
  (工具欠一次请求,或新输入到达 -> 下一个 step)
  agent/turn-stopping(serial,可中止)
turn/end

mini-dsh:
turn/start
  step/start
    system-prompt(waterfall) -> agent/request(waterfall)
    -> provider.stream -> assistant/chunk* -> assistant/message
    -> tools.execute(pre/execute/post) -> tool/result
  step/end
  (有工具调用 -> 下一个 step;maxSteps 兜底)
turn/end
```

## 官方仓库阅读指南

学完本教程,建议按这个顺序读官方源码:

1. [`docs/cordis-primer.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) —— 你已经会了,速览确认
2. [`docs/architecture.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) —— 全局地图
3. `packages/core/agent-loop/src/agent.ts` —— 找 `turn()` / `step` 循环,和 [07 章](../07-agent) 对照
4. `packages/llm/llm-deepseek/src/adapter.ts` —— 看 DeepSeek 适配器怎么处理流与工具调用
5. `packages/skill` —— 看技能系统的完整形态(catalog + loader 工具)
6. `docs/subsystems/core.md` —— 生成的 API 参考

## 延伸阅读

- 官方论文背景:[A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper)(Cordis 设计哲学)
- 官方技术背景:DeepSeek-R1 论文 [arXiv:2501.12948](https://arxiv.org/abs/2501.12948)(GRPO 与推理模型,harness 服务的模型方向)
- Cordis 社区:[cordiverse/cordis](https://github.com/cordiverse/cordis)
- 本教程源码:[xbsheng/deepseek-harness-tutorial](https://github.com/xbsheng/deepseek-harness-tutorial)

## 已知简化(诚实清单)

| 官方有,mini 没有 | 说明 |
|---|---|
| 沙箱/权限系统 | 生产必须;教学版工具直接执行 |
| 子代理(subagent) | 官方可派生子任务代理 |
| 会话分叉/回放 UI | 日志已支持,未做上层 |
| 工具 schema 运行时校验 | 官方用 zod;mini 参数 `any` |
| 上下文压缩(compaction) | 长会话的上下文管理策略 |
| HMR 热重载 | 官方开发体验的一部分 |
| 类型化事件(声明合并) | 官方工程细节,mini 用字符串事件名 |

这些缺口是绝佳的练习课题——比如「给 mini-dsh 加一个沙箱插件:监听 `tools/pre-execute` 拦截危险命令」。你现在已经知道该从哪里下手。

## 看完本教程之后

- 想了解 DeepSeek Harness 与 Claude Code / Pi / Cursor 等主流 coding agent 的架构对比,见[与主流 Coding Agent 对比](comparison)。
- 想直接上手官方 `dsh`:`npx @deepseek-ai/dsh web`。
