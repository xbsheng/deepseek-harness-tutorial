# Appendix: DeepSeek Harness vs Mainstream Coding Agents

> Perspective: August 2026. Coding agents iterate weekly — treat concrete numbers and features as directional and check each project's official docs. This chapter focuses on **architectural and philosophical** differences that are relatively stable.

## First, Clarify: Harness ≠ Coding Agent

This is the key to the whole comparison. The industry tends to lump two very different things together:

| | Agent Harness | Coding Agent (product) |
|---|---|---|
| Essence | **Framework / platform**: agent loop, tool system, sessions, permissions, UI infrastructure | **Product**: a ready-to-use tool for developers |
| Analogy | Operating system | Application |
| What you do | Build, customize, and embed your own agent with it | Use it directly to get work done |
| Examples | DeepSeek Harness, Pi, OpenCode | Claude Code, Cursor, Codex, Cline |

**DeepSeek Harness is the former, but can be used as the latter**: the official `dsh` CLI works out of the box in your terminal, much like Claude Code. Conversely, the "harness" parts of Claude Code (hooks, skills, subagents, tool pipeline) are the internals of a closed product — you can only use its exposed extension points.

## Mainstream Players at a Glance (mid-2026)

| Project | Form factor | Model | Open source | Core philosophy |
|---|---|---|---|---|
| **Claude Code** | Terminal CLI + IDE ext | Tied to Claude (swappable via base_url) | No | Human-in-the-loop: approvals, short turns, 1M context, hooks/subagents/skills/MCP |
| **OpenAI Codex** | CLI + cloud | GPT family | No | Long-horizon autonomy: Goal mode, cloud sandbox, background PRs |
| **Cursor** | AI-native IDE | Composer + model routing | No | Editor-native: Tab completion, Cloud Agents, visual UI verification |
| **Gemini CLI** | Terminal CLI | Gemini | Yes | Free, 1M context, model-neutral |
| **Cline** | VS Code extension | Any (BYOK) | Yes | Open-source autonomy: plan → edit → test → fix loop |
| **Aider** | Terminal CLI | Any (BYOK) | Yes | git-first: diffs are commits, minimal |
| **Pi** | CLI + RPC + SDK | Any (BYOK) | Yes | **Minimal primitives**: 4 tools by default (bash/read/write/edit), no MCP/subagents — nothing you didn't ask for |
| **OpenCode** | Terminal CLI | Any | Yes | Open harness: delegation architecture, polished TUI |
| **DeepSeek Harness** | CLI + Web + TS lib + Python SDK + MCP | Any (adapter seam) | Yes (MIT) | **Everything is a plugin**: Cordis-driven, six layers (contract/context/execution/evidence/repair/publish) |

## Deep Dive: DeepSeek Harness vs Claude Code vs Pi

These three represent three radically different architectural routes — the most instructive comparison:

| Dimension | DeepSeek Harness | Claude Code | Pi |
|---|---|---|---|
| **Positioning** | Agent framework/platform (usable as a product) | Terminal pair-programming product | Minimal harness |
| **Architecture** | Everything is a plugin (Cordis five ideas); registrations are reversible effects | Closed core + extension points (hooks/skills/MCP/subagents) | Minimal primitives: enough is enough, no feature stacking |
| **Model coupling** | Seam-decoupled: change base_url, change provider | Deeply tuned for its own models end-to-end | BYOK, fully neutral |
| **Extensibility** | Full-dimension plugins: tools/LLM/sandbox/UI/prompts all swappable & unloadable | Medium: CLAUDE.md, skills, hooks, MCP | Low (deliberate): config + a few primitives |
| **Context management** | Session event log (append-only) + projection/compaction | 1M window + CLAUDE.md + auto-compaction | Minimal state, no complex machinery |
| **Safe execution** | `sandbox`/`e2b` packages (swappable plugins) | Approval permission system (allow/deny/skip) | Direct local execution, user beware |
| **Forms** | dsh CLI / web / TS lib / Python SDK / MCP server | Terminal CLI + IDE ext + GitHub Actions | CLI / RPC / SDK |
| **Maturity** | Developer Preview (open-sourced 2026-08-13) | Mature product (launched 2025-02, two years of iteration) | Popular in the community; minimalist fanbase |
| **Who it's for** | Developers building/customizing/embedding agents | Developers who want out-of-the-box | Minimalists, users avoiding vendor lock-in |

## Three Key Philosophical Divides

### 1. Is the model the lever, or the harness?

A famous community debate (especially on HN): **"a harness is essentially prompts; the model is the main lever."** The same model through different harnesses produces nearly identical diffs on the same task, but token consumption can differ 3-4x — the difference is "dead weight" (tool descriptions, redundant exploration, wasted turns), not capability.

Two stances:
- **Claude Code's route**: models and harness tightly coupled, tuned end-to-end (prompts, tools, approval flows all optimized for their own models) — betting that coupling raises the ceiling.
- **DeepSeek Harness's route**: framework-neutral, models swappable through the seam. DeepSeek models are cheap and cache-friendly, making harness + DeepSeek a widely praised cost-effective combo (common setups: Claude Code/Pi/Cline + DeepSeek API, or just `dsh`).

### 2. "Everything is a plugin" vs closed core + extension points

- Claude Code locks the core loop and exposes hooks (lifecycle), skills (front-end injection), MCP (tools), and subagents (delegation). Stable and easy to adopt, but **you cannot replace the loop itself**.
- DeepSeek Harness treats even the agent loop, sessions, and UI as plugins: unloading a plugin unwinds everything it registered (reversible effects). The cost is a steeper learning curve — this tutorial's mini-Cordis chapter exists to lower that barrier.
- Pi takes a third path: **no plugin system at all**, just the smallest set of primitives (bash/read/write/edit) composed via config. Its argument: models keep getting stronger, so a harness only needs sane primitives.

### 3. Autonomy: who decides how far the agent goes?

| Design | Representative | Shape |
|---|---|---|
| Approval-gated (human-in-the-loop) | Claude Code | Confirm every dangerous action; short turns, frequent interaction |
| Long-horizon autonomy (walk-away) | Codex Goal mode | Set a goal and walk away for hours; cloud sandbox as backstop |
| Framework-granted | DeepSeek Harness | The **builder** decides: custom allow/deny rules via policy plugins (the pre-execute pipeline) |

## Concept Mapping: Mainstream Coding Agent ↔ Harness

Every harness concept in this tutorial has a counterpart in mainstream coding agents:

| Mainstream coding agent concept | Harness counterpart | mini-dsh location |
|---|---|---|
| `CLAUDE.md` (project memory) | system-prompt service / skill injection | `system-prompt` plugin |
| Hooks (lifecycle) | Event system (emit/waterfall/serial) | `src/context.ts` four dispatch modes |
| Skills (skill packs) | skills plugin (front-end injection tool) | `plugins/skills.ts` |
| MCP tool ecosystem | Tool registry + guarded pipeline | `src/tools.ts` |
| Subagents | Official child-task agent capability | not implemented (see known simplifications) |
| Permission approvals (allow/deny) | `tools/pre-execute` policy plugins | guarded pipeline waterfall |
| Session resume / `--continue` | Session event log JSONL persistence | `src/session.ts` |
| Streaming output | `assistant/chunk` events | `src/agent.ts` + Web SSE |

> So after this tutorial, you can already **read the internals of any coding agent** — they're just these concepts organized differently.

## Decision Guide: Which One Should You Use?

| Your situation | Recommendation | Why |
|---|---|---|
| Out-of-the-box, best reasoning | Claude Code | Mature, approval-gated, large window |
| Everyday coding in an editor | Cursor | Best editor-native experience |
| Background unattended tasks / auto-PR | Codex (Goal mode) | Cloud sandbox, long-horizon autonomy |
| Open source, minimal, avoid lock-in | Pi / Aider / Cline | BYOK, cost under your control |
| **Build your own agent/product/internal tool** | **DeepSeek Harness** | Everything is a plugin; embeddable and customizable |
| Learn agent architecture | **This tutorial (mini-dsh)** | Concept-isomorphic teaching implementation |

## The Honest Boundaries

- DeepSeek Harness was **only open-sourced on 2026-08-13** and is in Developer Preview: its ecosystem (skill libraries, MCP plugins, IDE integrations) is far less mature than Claude Code's.
- Everything above iterates on a weekly cadence — check official docs for numbers and features.
- This isn't "which is better" but "different routes for different problems": Claude Code wins on plug-and-play maturity, Pi wins on minimalism, DeepSeek Harness wins on **composability** — it's the open-source framework that lets you replace even the agent loop itself.

::: tip Further reading
- [Pi (minimal agent harness)](https://github.com/earendil-works/pi)
- [OpenCode (open-source terminal harness)](https://github.com/sst/opencode)
- [Claude Code docs](https://code.claude.com/docs/en/overview)
- This tutorial's [mapping to the official codebase](mapping)
:::
