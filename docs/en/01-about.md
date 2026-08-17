# Chapter 1: About DeepSeek Harness

## One Concept: What Is an Agent Harness?

In recent years, the dominant form of LLM applications has shifted from "question-and-answer" to **agents**: the model no longer just generates text — it **calls tools, reads and writes files, runs commands, and reasons in a loop** until the task is done.

But "making the model work" is far harder than "making the model talk." An agent that reliably does work must solve these engineering problems:

| Problem | Example |
|---|---|
| Context management | How do tool results, intermediate reasoning, and history stay organized without blowing up the context window? |
| Tool integration | How does the model declare a call, validate arguments, and get results back? |
| Loop control | Should the agent continue after calling a tool? How many rounds max? What about errors? |
| Auditability | What happened at every step? Can it be replayed, resumed, or audited? |
| Extensibility | Can you add a tool, swap a model, or change the execution environment without touching the core? |

**A harness is the "operating system" layer that answers these questions**: it assembles the model, tools, execution environment, and session state into a runnable agent, and makes every part replaceable and extensible.

## The Official Open Source: deepseek-ai/deepseek-harness

On **August 13, 2026**, DeepSeek open-sourced [`deepseek-ai/deepseek-harness`](https://github.com/deepseek-ai/deepseek-harness) (MIT license) with the motto:

> **Everything is a Plugin.**

Key facts:

- An open-source **agent harness** by DeepSeek, CLI tool named `dsh`
- Built on the **everything-is-a-plugin** architecture, driven by [Cordis](https://github.com/cordiverse/cordis) (design paper: *A Programming Paradigm for Spatiotemporal Composability*)
- Currently in **Developer Preview** and iterating fast
- A pnpm monorepo with ~50 `@deepseek-ai/dsh-*` packages in TypeScript, plus a Python SDK
- One command to try it: `npx @deepseek-ai/dsh web`

The official architecture introduces the concepts that form this tutorial's skeleton:

### 1. Cordis in Five Ideas

1. **A plugin is an object that implements Service** — a function plugin carries `inject` and `apply(ctx)`
2. **A context is a repository of services** — `ctx.tools` / `ctx.llm` / `ctx.sessions`
3. **`inject` declares service dependencies** — load order is derived from dependencies, not a manual boot list
4. **Typed events for communication** — four dispatch modes: `emit` (observe), `waterfall` (around-middleware), `parallel` (concurrent), `serial` (ordered, can stop)
5. **Registrations are reversible effects** — when a plugin unloads, everything it registered is unwound

### 2. Core Packages and the Event Flow

| Official package | Owns | Context key |
|---|---|---|
| `core/session` | Append-only session event log | `ctx.sessions` |
| `core/system-prompt` | Prompt sections + tool schema assembly | `ctx.systemPrompt` |
| `core/tools` | Scoped tool registry + guarded execution pipeline | `ctx.tools` |
| `core/agent` + `agent-loop` | Agent interface and default driver | `ctx.agents` |
| `llm/llm` | Message/stream vocabulary + adapter seam | `ctx.llm` |

The official flow of one **turn**:

```text
turn/start
  ├─ claim input, assemble prompt sections + tool schemas
  ├─ agent/pre-step (may reject / rewrite)
  ├─ step/start
  │   ├─ agent/request -> llm/stream -> assistant/chunk* -> assistant/message
  │   ├─ tool/call* -> tools/pre-execute -> execute -> post-execute -> tool/result*
  │   └─ step/end
  ├─ (tools owe another request, or new input arrives -> another step)
  └─ turn/end
```

::: info A step = one model request plus the tools it calls; a turn = zero or more steps.
:::

### 3. Capability Seams

The official codebase abstracts a swappable capability as a trio: **Service Definition (interface) + Provider (implementation) + Consumer (usually a model-facing tool)**. Swap the provider and the whole product changes with it — point the filesystem provider at a remote sandbox, and Shell, PTY, and LSP all move with it, with no provider forks.

## What This Tutorial Builds

The official repo is an 85MB, 50-package monorepo — a steep learning curve. So this tutorial takes a different route:

> **Using the official architecture as the blueprint, we implement a concept-isomorphic "simplified version" — mini-dsh — from scratch.**

mini-dsh is written in TypeScript (same language, same async model as the official), with **zero runtime dependencies** (only Node built-ins: `fetch` / `http` / `fs`), about 1,300 lines, and includes:

- ✅ Plugin system mini-Cordis: service repository, dependency injection, four event dispatch modes, reversible effects
- ✅ Session event log: append-only `SessionEvent` + `deriveMessages()` projection
- ✅ LLM adapter seam: DeepSeek (OpenAI-compatible) streaming client; `base_url` can point at any compatible endpoint
- ✅ Tool system: registry + JSON Schema + guarded execution pipeline
- ✅ Agent loop: turn/step flow aligned with the official event sequence
- ✅ Example plugins: system-prompt / shell / sandboxed filesystem / markdown skills
- ✅ CLI (`chat` / `run` / `web`) + 25 unit & integration tests, all green

## Roadmap

| Chapter | Content | Official counterpart |
|---|---|---|
| [02 Setup](02-setup) | Project skeleton, toolchain | Repository layout |
| [03 Plugin system](03-plugin) | mini-Cordis: plugins/services/events/effects | Cordis five ideas |
| [04 Session log](04-session) | Event log and message projection | `core/session` |
| [05 LLM adapter](05-llm) | DeepSeek streaming client | `llm/llm` + `llm-deepseek` |
| [06 Tool system](06-tools) | Registry + guarded pipeline | `core/tools` |
| [07 Agent loop](07-agent) | turn/step implementation | `core/agent-loop` |
| [08 Example plugins](08-plugins) | Prompt/Shell/FS/Skills | `skill` / `shell` / `fs` |
| [09 CLI](09-cli) | chat / run / web | `dsh` CLI, profile |
| [10 Testing](10-test) | 25 tests, how they are written and run | `docs/testing.md` |
| [11 Web UI](11-web) | SSE streaming chat in the browser | `dsh web` |

::: warning Disclaimer
This tutorial is an **independent teaching project** with no affiliation to DeepSeek. mini-dsh is a "concept-isomorphic simplified implementation", not a copy of the official code — the official repo is a 50-package TypeScript monorepo; we reimplement only its core design and simplify details aggressively (e.g. waterfall is reduced from `(...args, next)` to single-value passing). After this tutorial, you will already understand most of the official repo.
:::

Next: [Setup & Project Skeleton →](02-setup)
