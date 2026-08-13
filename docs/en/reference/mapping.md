# Appendix: Mapping to the Official Codebase

This table maps every concept you learned in mini-dsh back to the official repo — after this tutorial, you can already read most of `deepseek-ai/deepseek-harness`.

## Concept Mapping

| Official concept | Official location | mini-dsh | Difference |
|---|---|---|---|
| Cordis plugin framework | `vendor/` (vendored Cordis) | `src/context.ts` | Semantics aligned; waterfall simplified to single-value |
| Service repository `ctx.<key>` | `packages/core/*` | `ctx.service()/get()` | Official uses declaration merging for type safety; mini uses generics |
| Session event log | `packages/core/session` | `src/session.ts` | Subset of event types; official has projection/fork/replay |
| System prompt assembly | `packages/core/system-prompt` | `SystemPrompt` (in agent.ts) | Official also assembles tool schemas into the prompt |
| Tool registry & pipeline | `packages/core/tools` | `src/tools.ts` | Same event names (`tools/pre-execute` etc.) |
| Agent loop | `packages/core/agent-loop` | `src/agent.ts` | Same turn/step semantics, event subset |
| LLM seam | `packages/llm/llm` + `llm-deepseek` | `src/llm.ts` | Both OpenAI-compatible chat/completions + SSE |
| Skills | `packages/skill` | `plugins/skills.ts` | Official has catalog/loader tools; mini simplifies to two tools |
| Shell capability | `packages/shell` | `plugins/shell.ts` | Official goes through subprocess/sandbox services |
| Filesystem | `packages/fs` | `plugins/filesystem.ts` | Official supports `fs/*` policy events; mini inlines them |
| Profile/Bundle | `packages/bundle/*` | `boot.ts` | Official is YAML composition + patch overlays |
| Sandbox | `packages/sandbox` / `e2b` | not implemented | Deliberately skipped in the teaching version; production requires it |
| Web UI | `apps/web` | `src/web.ts` | Zero-dependency single page |
| CLI | `apps/cli` | `src/cli.ts` | `chat` / `run` / `web` |

## Event Mapping

| Official event | Dispatch mode | mini-dsh | Notes |
|---|---|---|---|
| `agent/request` | waterfall | ✅ same | rewritable request |
| `agent/pre-step` | waterfall | ⏭ merged | covered by agent/request |
| `agent/turn-stopping` | serial | ⏭ simplified | `maxSteps` safety net |
| `tools/pre-execute` / `post-execute` | waterfall | ✅ same | policy interception points |
| `tools/execute` | emit | ✅ same | audit observation point |
| `assistant/chunk` | emit | ✅ same | UI streaming |
| `llm/stream` | generator | ✅ same | same vocabulary |

## Official Turn Flow (full) vs mini

```text
official:
turn/start
  agent/pre-step (may reject/rewrite input)
  step/start
    agent/request -> llm/stream -> assistant/chunk* -> assistant/message
    tool/call* -> tools/pre-execute -> tools/execute -> tools/post-execute -> tool/result*
  step/end
  (tools owe another request, or new input arrived -> next step)
  agent/turn-stopping (serial, can stop)
turn/end

mini-dsh:
turn/start
  step/start
    system-prompt(waterfall) -> agent/request(waterfall)
    -> provider.stream -> assistant/chunk* -> assistant/message
    -> tools.execute(pre/execute/post) -> tool/result
  step/end
  (tool calls -> next step; maxSteps safety net)
turn/end
```

## Reading Guide for the Official Repo

After this tutorial, read the official source in this order:

1. [`docs/cordis-primer.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) — you already know this; skim to confirm
2. [`docs/architecture.md`](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) — the global map
3. `packages/core/agent-loop/src/agent.ts` — find `turn()` / the step loop, compare with [chapter 07](../07-agent)
4. `packages/llm/llm-deepseek/src/adapter.ts` — how the DeepSeek adapter handles streaming and tool calls
5. `packages/skill` — the full skill system (catalog + loader tools)
6. `docs/subsystems/core.md` — generated API reference

## Further Reading

- Design paper: [A Programming Paradigm for Spatiotemporal Composability](https://github.com/cordiverse/paper) (Cordis philosophy)
- DeepSeek-R1 paper [arXiv:2501.12948](https://arxiv.org/abs/2501.12948) (GRPO and reasoning models — the model direction this harness serves)
- Cordis community: [cordiverse/cordis](https://github.com/cordiverse/cordis)
- This tutorial: [xbsheng/deepseek-harness-tutorial](https://github.com/xbsheng/deepseek-harness-tutorial)

## Known Simplifications (the honest list)

| The official has, mini doesn't | Notes |
|---|---|
| Sandbox / permission system | Production-critical; the teaching version executes tools directly |
| Subagents | the official can spawn child task agents |
| Session fork / replay UI | the log supports it; no upper layer yet |
| Runtime tool-schema validation | official uses zod; mini args are `any` |
| Context compaction | context management strategy for long sessions |
| HMR hot reload | part of the official dev experience |
| Typed events (declaration merging) | an official engineering detail; mini uses string event names |

These gaps are great practice problems — e.g. "add a sandbox plugin to mini-dsh that listens to `tools/pre-execute` and blocks dangerous commands". You now know exactly where to start.

## After This Tutorial

- For an architectural comparison of DeepSeek Harness with mainstream coding agents (Claude Code / Pi / Cursor...), see [vs Mainstream Coding Agents](comparison).
- To try the official `dsh` directly: `npx @deepseek-ai/dsh web`.
