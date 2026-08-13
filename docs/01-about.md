# 序章:认识 DeepSeek Harness

## 一个概念:什么是 Agent Harness

过去两年,大模型应用的主流形态从「一问一答」变成了「智能体(Agent)」:模型不再只是生成文字,而是**调用工具、读写文件、执行命令、循环推理**直到完成任务。

但「让模型干活」远比「让模型说话」复杂。一个能稳定干活的智能体,需要解决这些工程问题:

| 问题 | 举例 |
|---|---|
| 上下文怎么管 | 工具结果、中间推理、历史消息如何组织,才不会撑爆上下文窗口 |
| 工具怎么接 | 模型如何声明要调用什么、参数怎么校验、结果怎么回传 |
| 循环怎么控制 | 模型调用工具后要不要继续?最多几轮?出错怎么办 |
| 过程怎么留痕 | 每一步发生了什么,如何可审计、可回放、可续跑 |
| 能力怎么扩展 | 加一个新工具、换一个模型、换一个执行环境,能不能不动核心代码 |

**Harness(执行层)就是为回答这些问题而生的一层「操作系统」**:它把模型、工具、执行环境、会话状态组装成一个可运行的智能体,并让每个部件都可以被替换和扩展。

## 官方开源:deepseek-ai/deepseek-harness

2026 年 8 月 13 日,**DeepSeek 官方**在 GitHub 开源了 [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness)(MIT 协议),口号是:

> **Everything is a Plugin(一切皆插件)**

它的核心事实:

- 一个由 DeepSeek 开发的**开源 agent harness(智能体框架)**,命令行工具叫 `dsh`
- 采用**一切皆插件**的架构,由 [Cordis](https://github.com/cordiverse/cordis) 插件框架驱动(设计源自论文 *A Programming Paradigm for Spatiotemporal Composability*)
- 目前处于**开发者预览(Developer Preview)**阶段,仍在快速迭代
- 典型的 monorepo:pnpm workspaces,约 50 个 `@deepseek-ai/dsh-*` 包,TypeScript 实现,另有 Python SDK
- 一条命令即可体验:`npx @deepseek-ai/dsh web` 启动 Web UI

官方架构中有几个关键概念,也是本教程的骨架:

### 1. Cordis 五大思想(插件系统的哲学)

1. **插件是实现 Service 的对象** —— 函数插件带 `inject` 和 `apply(ctx)`
2. **上下文是服务的仓库** —— `ctx.tools` / `ctx.llm` / `ctx.sessions` 都是服务
3. **`inject` 声明服务依赖** —— 加载顺序由依赖关系推导,而不是手排启动清单
4. **事件驱动通信** —— 四种分发模式:`emit`(观察)、`waterfall`(环绕中间件)、`parallel`(并发)、`serial`(有序可中止)
5. **注册是可逆效应** —— 插件卸载时,它注册的一切都被回收

### 2. 核心包与事件流

| 官方包 | 负责什么 | 上下文键 |
|---|---|---|
| `core/session` | 追加式会话事件日志 | `ctx.sessions` |
| `core/system-prompt` | 提示词片段与工具 schema 组装 | `ctx.systemPrompt` |
| `core/tools` | 作用域化工具注册表 + 受管执行管线 | `ctx.tools` |
| `core/agent` + `agent-loop` | Agent 接口与默认驱动 | `ctx.agents` |
| `llm/llm` | 消息/流词汇 + 适配器缝隙 | `ctx.llm` |

官方一个 **turn**(一轮对话)的流程:

```text
turn/start
  ├─ 认领输入,组装提示词片段 + 工具 schema
  ├─ agent/pre-step(可拒绝/改写)
  ├─ step/start
  │   ├─ agent/request -> llm/stream -> assistant/chunk* -> assistant/message
  │   ├─ tool/call* -> tools/pre-execute -> execute -> post-execute -> tool/result*
  │   └─ step/end
  ├─ (有工具调用或新输入到达 -> 再来一个 step)
  └─ turn/end
```

::: info 一个 step = 一次模型请求 + 它调用的工具;一个 turn = 零或多个 step。
:::

### 3. 能力缝隙(Seam)

官方把「可替换能力」抽象成三件套:**Service Definition(接口声明)+ Provider(实现)+ Consumer(消费方,通常是模型工具)**。换一个 Provider,整个产品的行为随之改变 —— 比如把文件系统 Provider 指向远程沙箱,Shell、终端、LSP 全部跟着走,不需要为每种能力写两套代码。

## 本教程:我们要做什么

官方仓库 85MB、50 个包,直接啃源码门槛很高。所以本教程的做法是:

> **以官方架构为蓝图,从零实现一个概念同构的「简易版」—— mini-dsh。**

mini-dsh 用 TypeScript 实现(与官方同语言、同异步模型),**零运行时依赖**(只用 Node 内置的 `fetch`/`http`/`fs`),约 1200 行代码,包含:

- ✅ 插件系统 mini-Cordis:服务仓库、依赖注入、四类事件分发、可逆效应
- ✅ 会话事件日志:追加式 `SessionEvent` + `deriveMessages()` 消息投影
- ✅ LLM 适配器缝隙:DeepSeek(OpenAI 兼容)流式客户端,`base_url` 可指向任何兼容端点
- ✅ 工具系统:注册表 + JSON Schema + 受管执行管线
- ✅ Agent 循环:turn/step 流,与官方事件序列对齐
- ✅ 示例插件:system-prompt / shell / 文件系统(沙箱化)/ 技能(Markdown)
- ✅ CLI(`chat` / `run` / `web`)+ 23 个单元与集成测试

## 路线图

| 章节 | 内容 | 对应官方概念 |
|---|---|---|
| [02 环境准备](02-setup) | 项目骨架、工具链 | 仓库布局 |
| [03 插件系统](03-plugin) | mini-Cordis:插件/服务/事件/效应 | Cordis 五大思想 |
| [04 会话日志](04-session) | 事件日志与消息投影 | `core/session` |
| [05 LLM 适配器](05-llm) | DeepSeek 流式客户端 | `llm/llm` + `llm-deepseek` |
| [06 工具系统](06-tools) | 注册表 + 受管管线 | `core/tools` |
| [07 Agent 循环](07-agent) | turn/step 实现 | `core/agent-loop` |
| [08 示例插件](08-plugins) | 提示词/Shell/文件/技能 | `skill` / `shell` / `fs` |
| [09 CLI](09-cli) | chat / run / web | `dsh` CLI、profile |
| [10 测试](10-test) | 23 个测试的写法和跑法 | `testing.md` 策略 |
| [12 部署](12-deploy) | 本教程站上线 GitHub Pages | —— |

::: warning 声明
本教程是**独立教学项目**,与 DeepSeek 官方无隶属关系。mini-dsh 是「概念同构的简化实现」,并非官方代码的搬运 —— 官方仓库是 50 个包的 TS monorepo,我们只复刻其核心设计,细节上做了大量简化(例如瀑布流从 `(...args, next)` 简化为单值传递)。学完本教程后,再去看官方仓库,你会发现自己已经能读懂大半。
:::

下一步:[环境准备与项目骨架 →](02-setup)
