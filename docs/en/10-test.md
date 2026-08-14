# Testing & Verification

> Official counterpart: the layered testing strategy in `docs/testing.md`

## Strategy: Four Layers

| Layer | What it covers | Tools | Key needed? |
|---|---|---|---|
| Unit tests | Plugin semantics, session projection, tool pipeline | in-memory objects | ❌ |
| Integration tests | Full agent turns, assembly (boot) | ScriptedProvider | ❌ |
| Protocol tests | SSE parsing, HTTP error handling | `node:http` mock server | ❌ |
| Smoke test | Real DeepSeek conversations | real API | ✅ |

**90% is testable without a key** — that's the payoff of ScriptedProvider and the mock server.

## Running the Tests

```bash
pnpm test          # vitest run
pnpm typecheck    # tsc --noEmit
```

Real output:

```
 Test Files  6 passed (6)
      Tests  25 passed (25)
```

## Test Files, Dissected

### test/context.test.ts — plugin system semantics

Covers: dependency-ordered mounting, missing-dependency errors, reverse teardown, waterfall short-circuit/delegate, serial stop, parallel concurrency, listener disposal. These are the framework's foundations — one test per semantic.

### test/session.test.ts — log projection

```ts
it("deriveMessages correctly projects model history", () => {
  // build: user -> assistant(tool_calls) -> tool/result -> assistant
  expect(messages).toEqual([...]);  // assert order and fields one by one
});

it("non-message events (step/start etc.) never enter the model context", () => {
  expect(roles).toEqual(["user", "assistant"]);
});
```

### test/tools.test.ts — the tool pipeline

Pre-execute rewriting args, post-execute rewriting results, unregister-as-effect, unknown-tool errors.

### test/llm.test.ts — SSE protocol (the important one)

A `node:http` server returns **real SSE byte streams**, verifying the parser:

```ts
beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(responses.shift() ?? "");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as any).port;
});
```

Three cases:

1. **Streaming text**: two content deltas + `[DONE]` → chunks in order, final message complete
2. **Streaming tool calls**: stitched by index across two deltas (`id`/`name`/`arguments`) — the easiest thing to get wrong
3. **HTTP 401**: error response throws `LLMError` carrying the first 300 chars

::: tip How to write fixtures without escaping hell
Hand-written escaped JSON strings break constantly (we hit this for real). **Generate fixtures with `JSON.stringify`**:
```ts
const chunk1 = JSON.stringify({
  choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "add", arguments: '{"a":' } }] } }],
});
```
Program-generated JSON is always valid; the test should care about protocol behavior, not hand-rolled escapes.
:::

### test/agent.test.ts — the turn contract

Script the model's behavior with ScriptedProvider and assert **log order, event order, and the final answer**:

```ts
const script = [
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function",
      function: { name: "add", arguments: '{"a":1,"b":2}' } }] },
  { role: "assistant", content: "The result is 3" },
];
// ...
expect(types).toEqual(["user/message", "assistant/message", "tool/result", "assistant/message"]);
expect(events).toEqual(["turn/start", "step/start", "step/end", "step/start", "step/end", "turn/end"]);
```

Plus two edge cases:

- **Tool failure**: `{"a":"oops"}` triggers a type error → `<tool error>` written to the log, the loop continues
- **maxSteps safety net**: the model keeps calling tools → forced stop after 3 steps, no infinite loop

The boot integration test verifies full assembly: scripted mode goes through `buildAgent()`, and the fs plugin **really writes a file to disk**.

### test/web.test.ts — SSE streaming UI

Starts the real HTTP server and asserts the streaming contract:

```ts
it("/api/chat streams deltas over SSE and ends with a done event", async () => {
  // ...scripted provider, real port...
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const events = text.split("\n").filter(l => l.trim().startsWith("data:")).map(JSON.parse);
  expect(deltas.join("")).toBe("你好,这是流式回答!"); // deltas reassemble to the full reply
  expect(deltas.length).toBeGreaterThan(1);           // genuinely chunked, not one-shot
  expect(done.done).toBe(true);                       // proper close
});
```

## Smoke Test (needs a key)

```bash
export DEEPSEEK_API_KEY=sk-xxx
pnpm run run "What is 1+1? compute it with the run_bash tool"
```

Expect: the model requests a tool → `tool/result` content `2` → final answer. The whole chain (plugins → loop → LLM → tools → log) is verified in one shot.

::: tip Recap
- Four layers: unit / integration / protocol / smoke; the first three are key-free
- ScriptedProvider scripts the model's behavior to assert the turn contract
- A mock HTTP server verifies real SSE byte-stream parsing
- Fixtures are generated with `JSON.stringify`, never hand-escaped

Next: [Web UI (SSE Streaming) →](11-web)
:::
