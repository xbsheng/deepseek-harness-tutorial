# Core 5: Agent Loop

> Official counterpart: `core/agent-loop` — the default driver of the turn/step flow

This chapter is the heart of mini-dsh. Everything from the previous chapters (plugins, log, LLM, tools) converges here into a loop that can **work autonomously**.

## Turn and Step

Official definition:

> A **step** is one model request plus the tools it calls; a **turn** is zero or more steps.

```text
turn/start
  ├─ user/message enters the log
  ├─ step 0: model request -> model says it wants to call run_bash
  │    └─ execute run_bash -> tool/result enters the log
  ├─ step 1: model request (now with the tool result) -> final answer
  └─ turn/end
```

When does the loop stop?

1. The model made **no tool calls** this round → it has an answer; stop
2. `maxSteps` reached (default 8) → anti-infinite-loop; stop

## Implementation, Piece by Piece

### Entry and turn boundaries

```ts
async turn(userInput: string): Promise<ChatMessage> {
  const ctx = this.ctx;
  const session = this.session;
  const tools = ctx.get<ToolRegistry>("tools");

  ctx.emit("turn/start", { agent: this, session });
  session.append("turn/start", { agent: this.session.id });
  session.append("user/message", { content: userInput });
```

Note the dual write: **live events (`ctx.emit`) for observers, durable events (`session.append`) for the log.** The official splits events into "session events (durable)" and "agent events (live)"; we do the same.

### The step loop: assembling the request

```ts
for (let step = 0; step < this.maxSteps; step++) {
  ctx.emit("step/start", { step, session });
  session.append("step/start", { step });

  // Assemble the request: system prompt (waterfall-rewritable) + history + tool schemas
  const systemPrompt = await ctx.waterfall("system-prompt", this.renderSystemPrompt());
  const messages = session.deriveMessages();
  if (systemPrompt) messages.unshift({ role: "system", content: systemPrompt });
  const request = await ctx.waterfall<{ messages: ChatMessage[]; tools: unknown[] }>(
    "agent/request",
    { messages, tools: tools?.schemas() ?? [] },
  );
```

Three key designs:

1. **Context always projects from the log** — `session.deriveMessages()`; the log is the single source of truth
2. **`system-prompt` is a waterfall** — any plugin can add a section (skill injection and safety rules in later chapters both go through here)
3. **`agent/request` is a waterfall** — before the request goes out, plugins can rewrite the messages and tool list wholesale (same event name as the official)

### Streaming request and events

```ts
  // Streaming request: chunk events broadcast live; the message event is authoritative
  let content = "";
  let toolCalls: ToolCall[] = [];
  for await (const ev of this.provider.stream(request.messages, request.tools)) {
    if (ev.type === "chunk") {
      session.append("assistant/chunk", { delta: ev.delta });
      ctx.emit("assistant/chunk", { delta: ev.delta, session });
    } else {
      content = ev.message.content ?? "";
      toolCalls = ev.message.tool_calls ?? [];
    }
  }
  session.append("assistant/message", { content, tool_calls: toolCalls });
```

`chunk` events broadcast live — the CLI and Web UI subscribe for typewriter effects; the `message` event is the authoritative result and goes into the log.

### Tool execution and result write-back

```ts
  if (toolCalls.length === 0) {
    assistant = { role: "assistant", content };
    ctx.emit("step/end", { step, tool_calls: 0, session });
    session.append("step/end", { step, tool_calls: 0 });
    break;   // no tool calls => it has an answer
  }

  // Execute each tool call the model requested; results go back into the log
  for (const tc of toolCalls) {
    ctx.emit("tool/call", { name: tc.function.name, args: tc.function.arguments, session });
    let resultText: string;
    try {
      const parsed = JSON.parse(tc.function.arguments || "{}") as Record<string, any>;
      const result = await tools!.execute(tc.function.name, parsed);
      resultText = typeof result === "string" ? result : JSON.stringify(result);
    } catch (err) {
      resultText = `<tool error: ${err instanceof Error ? err.message : String(err)}>`;
    }
    session.append("tool/result", { tool_call_id: tc.id, content: resultText });
  }
  ctx.emit("step/end", { step, tool_calls: toolCalls.length, session });
  session.append("step/end", { step, tool_calls: toolCalls.length });
}
ctx.emit("turn/end", { session });
session.append("turn/end", {});
return assistant;
```

::: tip Tool errors don't crash the turn
Tool exceptions are caught and written as a `<tool error: ...>` `tool/result`. The model sees the error and **decides what to do next itself** — retry with different arguments, or explain the failure to the user. This is the crudest form of the "repair" capability: the error is itself part of the context.
:::

## Full Source

<<< ../../mini-dsh/src/agent.ts

## Mapping to the Official Turn Flow

| Official | mini-dsh | Notes |
|---|---|---|
| `turn/start` (durable) | `session.append("turn/start")` + `ctx.emit` | dual write |
| `agent/pre-step` (waterfall) | merged away | official can reject/rewrite input; not implemented separately |
| `agent/request` (waterfall) | `ctx.waterfall("agent/request")` | same |
| `llm/stream` | `provider.stream()` | same |
| `assistant/chunk*` → `assistant/message` | same dual events | same |
| `tool/call*` → `tools/pre-execute` → `execute` → `post-execute` → `tool/result*` | `tools.execute()` + three events | same pipeline |
| `agent/turn-stopping` (serial) | not implemented | `maxSteps` as a safety net |
| `turn/end` (durable) | same | |

One thing the official has that we deliberately skip: `agent/pre-step` (letting plugins review input before claiming it). mini-dsh covers the "request is rewritable" core scenario with the single `agent/request` waterfall, keeping teaching complexity manageable.

## Test: One Complete Turn

```ts
it("full turn: model calls a tool -> gets the result -> gives the final answer", async () => {
  const { ctx, agent } = makeAgent([
    { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function",
        function: { name: "add", arguments: '{"a":1,"b":2}' } }] },
    { role: "assistant", content: "The result is 3" },
  ]);
  // ...subscribe to events...
  const reply = await agent.turn("1+1=?");
  expect(reply.content).toBe("The result is 3");
  // session log: user -> assistant(with tool_calls) -> tool/result -> assistant
  expect(types).toEqual(["user/message", "assistant/message", "tool/result", "assistant/message"]);
  // event sequence: two steps
  expect(events).toEqual(["turn/start", "step/start", "step/end", "step/start", "step/end", "turn/end"]);
});
```

This test asserts the whole chain: log order, event order, and the final answer — the core contract of a harness, condensed into three assertions.

::: tip Recap
- A turn = zero or more steps; a step = one model request + tools
- Context projects from the log; requests are waterfall-rewritable
- Tool errors enter the context; the model decides how to repair
- Tests use ScriptedProvider to assert the turn contract precisely

Next: [Example Plugins →](08-plugins)
:::
