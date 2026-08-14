# Core 2: Session Event Log

> Official counterpart: `core/session` — "the session log is the single source of truth for the model's context"

## Core Idea: What the Model Sees Must Be in the Log

The biggest difference between an agent and a plain chat is **process complexity**: the model requests multiple times, calls tools, gets results, and continues. If we only kept the "final conversation", we could never answer:

- What exactly did the model see? (audit)
- What did the tool return at each step? (replay)
- How do we resume after an interruption? (recovery)
- How does the UI render streaming output? (fidelity)

The official answer: **everything is based on an append-only event log.** Anything that enters a model request must first be written as a session event; the model's message history (`deriveMessages()`) is **projected** from the log, not maintained separately.

```text
user/message ──► assistant/message(tool_calls) ──► tool/result ──► assistant/message
      └──────────────── log (ground truth) ──────────────────────┘
                              │
                              ▼ deriveMessages()
                   the messages array the model actually sees
```

## Event Types

| Event type | Durable | Role |
|---|---|---|
| `turn/start` / `turn/end` | ✅ | Boundaries of one turn |
| `step/start` / `step/end` | ✅ | Boundaries of one step (a request + its tools) |
| `user/message` | ✅ | User input, enters the model context |
| `assistant/chunk` | ✅ | Streaming deltas (replay/UI fidelity) |
| `assistant/message` | ✅ | Complete assistant message (incl. tool_calls), enters the context |
| `tool/result` | ✅ | Tool result, enters the context |

::: tip Why keep `assistant/chunk`?
`assistant/message` is the final result; `chunk` is the process. Keeping chunks in the log lets the UI replay exactly how the text was generated. The official calls this "preserving replay and UI fidelity".
:::

## Implementation

### Append-only log

<<< ../../mini-dsh/src/session.ts{10-50}

Key points:

- `append()` adds `seq` and `ts` automatically; events are immutable — that's "append-only"
- `deriveMessages()` cares about only the three message events and projects them into an array the model can consume directly

### Message projection

<<< ../../mini-dsh/src/session.ts{52-70}

Note the `assistant/message` projection: include `tool_calls` when present; `tool/result` pairs with the assistant's tool call via `tool_call_id` — a hard requirement of the OpenAI-compatible protocol, order must not change:

```ts
// what the model sees (strict order)
[
  { role: "user", content: "What is 1+1?" },
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "run_bash", arguments: "..." } }] },
  { role: "tool", tool_call_id: "call_1", content: "2" },
  { role: "assistant", content: "The answer is 2." },
]
```

### Persistence: JSONL

<<< ../../mini-dsh/src/session.ts{72-99}

One JSON event per line, session metadata (id) on the first line. An append-only log fits JSONL naturally: resume = read line by line, persist = append.

### Session registry

<<< ../../mini-dsh/src/session.ts{101-115}

Corresponds to the official `ctx.sessions` — manages multiple sessions (multi-session web UI, resume-after-interrupt).

## A Real Session Log

This is the **actual output** of `pnpm run demo` (scripted demo):

```text
turn/start           {"agent":"5a1b896f-beb"}
user/message         {"content":"1+1 等于多少?用工具算一下"}
step/start           {"step":0}
assistant/chunk      {"delta":{"content":"让我先算"}}
assistant/chunk      {"delta":{"content":"一下。"}}
assistant/message    {"content":"让我先算一下。","tool_calls":[{"id":"call_1",...}]}
tool/result          {"tool_call_id":"call_1","content":"2"}
step/end             {"step":0,"tool_calls":1}
step/start           {"step":1}
assistant/chunk      {"delta":{"content":"计算完成"}}
assistant/chunk      {"delta":{"content":":1+1"}}
assistant/chunk      {"delta":{"content":"=2。"}}
assistant/message    {"content":"计算完成:1+1=2。","tool_calls":[]}
step/end             {"step":1,"tool_calls":0}
turn/end             {}
```

The `"2"` in `tool/result` is not fabricated — it's the real result of `run_bash` executing `echo 1+1 | bc`.

::: warning An engineering iron rule
Any new input entering the model context (e.g. skill injection in a later chapter) must **first go into the log, then into the request**. Bypassing the log corrupts replay and audit. The official enforces this with runtime invariants; we rely on discipline.
:::

## Test Coverage

```ts
it("deriveMessages correctly projects model history", () => {
  // ...build the log...
  expect(messages).toEqual([...]); // assert order and fields one by one
});

it("non-message events (step/start etc.) never enter the model context", () => {
  // turn/start, step/start, assistant/chunk are all filtered
  expect(roles).toEqual(["user", "assistant"]);
});
```

::: tip Recap
- The log is the **single source of truth**; context is projected from it
- Message events `user/message` / `assistant/message` / `tool/result` enter the model; everything else serves replay and audit
- JSONL persistence makes sessions resumable and replayable

Next: [LLM Adapter Seam →](05-llm)
:::
