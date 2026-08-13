# 附录:DeepSeek Harness 与主流 Coding Agent 对比

> 视角:2026 年 8 月。Coding agent 迭代极快,具体数字与功能请以各项目官方文档为准,本章只讨论**架构与哲学**层面相对稳定的差异。

## 先厘清概念:Harness 与 Coding Agent 不是一回事

这是理解整个对比的关键。业界常把两类东西混在一起讨论:

| | Agent Harness(智能体执行层) | Coding Agent(编程智能体产品) |
|---|---|---|
| 本质 | **框架 / 平台**:提供 agent 循环、工具系统、会话、权限、UI 等基础设施 | **产品**:面向开发者开箱即用的具体工具 |
| 类比 | 操作系统 | 应用软件 |
| 你能做什么 | 用框架构建、定制、嵌入自己的 agent | 直接拿来干活 |
| 例子 | DeepSeek Harness、Pi、OpenCode | Claude Code、Cursor、Codex、Cline |

**DeepSeek Harness 是前者,但它也能当后者用**:官方 `dsh` CLI 开箱即可像 Claude Code 一样在终端干活。反过来,Claude Code 的"harness"部分(hooks、技能、子代理、工具管线)是封闭产品的内部实现,你只能用它暴露的扩展点。

## 主流选手速览(2026 年中)

| 项目 | 形态 | 模型 | 开源 | 核心哲学 |
|---|---|---|---|---|
| **Claude Code** | 终端 CLI + IDE 扩展 | 深度绑定 Claude 系(可经 base_url 换) | 否 | 人机协作:审批制、短回合、1M 上下文、hooks/subagents/skills/MCP |
| **OpenAI Codex** | CLI + 云端 | GPT 系 | 否 | 长时自主:Goal 模式无人值守、云端沙箱、后台提 PR |
| **Cursor** | AI 原生 IDE | Composer + 各家模型路由 | 否 | 编辑器原生:Tab 补全、Cloud Agents 并行、浏览器验证 UI |
| **Gemini CLI** | 终端 CLI | Gemini | 是 | 免费、1M 上下文,模型中立 |
| **Cline** | VS Code 插件 | 任意(BYOK) | 是 | 开源自主:计划→编辑→测试→修复循环 |
| **Aider** | 终端 CLI | 任意(BYOK) | 是 | git-first:diff 即提交,极简 |
| **Pi** | CLI + RPC + SDK | 任意(BYOK) | 是 | **极简原语**:默认仅 4 个工具(bash/read/write/edit),无 MCP/subagent,不用不给 |
| **OpenCode** | 终端 CLI | 任意 | 是 | 开放 harness:代理/委派架构、TUI 体验 |
| **DeepSeek Harness** | CLI + Web + TS 库 + Python SDK + MCP | 任意(适配器缝隙) | 是(MIT) | **一切皆插件**:Cordis 驱动,契约/上下文/执行/证据/修复/发布六层 |

## 深度对比:DeepSeek Harness vs Claude Code vs Pi

三者恰好代表三种截然不同的架构路线,放在一起对比最有价值:

| 维度 | DeepSeek Harness | Claude Code | Pi |
|---|---|---|---|
| **定位** | 智能体框架/平台(可当产品用) | 终端结对编程产品 | 极简 harness |
| **架构哲学** | 一切皆插件(Cordis 五思想),注册即可逆效应 | 封闭核心 + 扩展点(hooks/skills/MCP/subagents) | 极简原语:够用即可,拒绝功能堆叠 |
| **模型耦合** | 缝隙解耦:换 base_url 即换 provider | 深度绑定自家模型做端到端调优 | BYOK,完全中立 |
| **扩展方式** | 插件系统全维度:工具/LLM/沙箱/UI/提示词全部可换可卸载 | 中等:CLAUDE.md、skills、hooks、MCP | 低(刻意):配置文件 + 少量原语 |
| **上下文管理** | 会话事件日志(append-only)+ 投影/压缩 | 1M 大窗口 + CLAUDE.md + 自动压缩 | 精简状态,无复杂机制 |
| **安全执行** | `sandbox`/`e2b` 沙箱包(插件可换) | 审批制权限系统(允许/拒绝/跳过) | 本地直接执行,靠用户自觉 |
| **使用形态** | dsh CLI / web / TS 库 / Python SDK / MCP server | 终端 CLI + IDE 扩展 + GitHub Actions | CLI / RPC / SDK |
| **成熟度** | Developer Preview(2026-08 才开源) | 成熟产品(2025-02 发布,迭代两年) | 社区流行,极简拥趸多 |
| **适合谁** | 想构建/定制/嵌入 agent 的开发者 | 想直接开箱干活的开发者 | 极简主义者、想避免厂商绑定的用户 |

## 三个关键哲学分歧

### 1. 模型是杠杆,还是框架是杠杆?

社区(尤其 HN)有一个著名争论:**"harness 本质上就是一堆 prompt,模型才是主要杠杆。"** 同一次任务,不同 harness 用同一个模型能产出几乎相同的 diff,但 token 消耗可以差 3-4 倍——差的是"死重"(工具描述、多余探索、无效轮次),不是能力。

两种立场:
- **Claude Code 路线**:模型与框架深度绑定,端到端调优(提示词、工具、审批流全为自家模型优化),押注"绑定产出上限"。
- **DeepSeek Harness 路线**:框架中立,模型走缝隙可换。DeepSeek 模型价格低、缓存友好,harness + DeepSeek 模型组合是社区公认的高性价比方案(常见搭配:Claude Code/Pi/Cline + DeepSeek API,或直接用 `dsh`)。

### 2. "一切皆插件" vs 封闭核心 + 扩展点

- Claude Code 把核心循环锁死,只开放 hooks(生命周期钩子)、skills(前端注入)、MCP(工具)、subagents(委派)。稳定、易上手,但**不能换掉循环本身**。
- DeepSeek Harness 连 agent 循环、会话、UI 都是插件:卸载一个插件就是卸载它注册的一切(可逆效应)。代价是学习曲线陡——本教程的 mini-Cordis 章节就是在降低这个门槛。
- Pi 走第三条路:**不做插件系统,只给最少的原语**(bash/read/write/edit),用配置组合。它的论点是"模型越来越强,harness 只需要合理的原语"。

### 3. 自主度:谁来决定 agent 能走多远?

| 设计 | 代表 | 形态 |
|---|---|---|
| 审批制(human-in-the-loop) | Claude Code | 每个危险动作都要确认,短回合高频交互 |
| 长时自主(walk-away) | Codex Goal 模式 | 设定目标后跑几小时,云端沙箱兜底 |
| 框架授权 | DeepSeek Harness | 把决定权交给**构建者**:你通过策略插件(pre-execute 管线)自定义放行/拦截规则 |

## 概念映射:Claude Code / 通用 coding agent ↔ Harness

本教程学到的每个 harness 概念,都能在主流 coding agent 里找到对应物:

| 主流 coding agent 的概念 | Harness 中的对应 | mini-dsh 位置 |
|---|---|---|
| `CLAUDE.md`(项目记忆) | system-prompt 服务/技能注入 | `system-prompt` 插件 |
| hooks(生命周期钩子) | 事件系统(emit/waterfall/serial) | `src/context.ts` 四类事件 |
| Skills(技能包) | skills 插件(前端注入工具) | `plugins/skills.ts` |
| MCP 工具生态 | 工具注册表 + 受管管线 | `src/tools.ts` |
| Subagents(子代理) | 官方子任务 agent 能力 | 未实现(见附录已知简化) |
| 权限审批(allow/deny) | `tools/pre-execute` 策略插件 | 受管管线 waterfally |
| 会话恢复/--continue | 会话事件日志 JSONL 持久化 | `src/session.ts` |
| 流式输出 | `assistant/chunk` 事件 | `src/agent.ts` + Web SSE |

> 所以学完本教程,你已经能**读懂任何 coding agent 的内部结构**——它们只是把上面这些概念用不同方式组织起来。

## 决策指南:你应该用哪个?

| 你的场景 | 推荐 | 理由 |
|---|---|---|
| 直接开箱干活,想要最好的推理 | Claude Code | 成熟、审批制、大窗口 |
| 编辑器内日常编码 | Cursor | 编辑器原生体验最好 |
| 后台无人值守任务/自动 PR | Codex(Goal 模式) | 云端沙箱长时自主 |
| 开源、极简、避免厂商绑定 | Pi / Aider / Cline | BYOK,成本自控 |
| **构建自己的 agent/产品/公司内部工具** | **DeepSeek Harness** | 一切皆插件,可嵌入可定制 |
| 学习 agent 架构原理 | **本教程 mini-dsh** | 概念同构的教学实现 |

## 诚实的边界

- DeepSeek Harness 于 **2026-08-13 才开源**,处于 Developer Preview:**生态(技能库、MCP 插件、IDE 集成)远不如 Claude Code 成熟**。
- 上表中的产品迭代都以周为单位,功能与数字请以官方文档为准。
- 对比不是"谁更好",而是"不同路线解决不同问题":Claude Code 赢在即插即用的成熟度,Pi 赢在极简,DeepSeek Harness 赢在**可组合性**——它是唯一让你把 agent 循环本身也换掉的开源框架。

::: tip 延伸阅读
- [Pi(极简 agent harness)](https://github.com/earendil-works/pi)
- [OpenCode(开源终端 harness)](https://github.com/sst/opencode)
- [Claude Code 官方文档](https://code.claude.com/docs/en/overview)
- 本教程[与官方架构对照](mapping)
:::
