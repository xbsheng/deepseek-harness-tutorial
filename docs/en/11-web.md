# Optional: Web UI (SSE Streaming)

> Official counterpart: `dsh web` + `apps/web` (browser app)

The most recognizable official experience is the browser UI started by `npx @deepseek-ai/dsh web`. mini-dsh implements a **zero-dependency** version with `node:http` — one page + one SSE endpoint, and the browser chats with the agent with **incremental rendering**, just like the official product.

## Architecture: Two Key Designs

1. **`createChatServer(ctx, agent)` is independently testable** — pass in an assembled context and agent, get back an HTTP server. Tests can boot it with a ScriptedProvider and verify the full SSE stream.
2. **`/api/chat` is an SSE event stream** — not "send once, wait for everything", but:

```text
data: {"delta":"你"}              ← streaming delta
data: {"delta":"好"}
data: {"delta":"!"}
data: {"done":true,"content":"你好!"}  ← turn finished, with the full final text
data: {"error":"..."}             ← error (the channel stays open)
```

## Backend: Subscribe to Events, Push in Real Time

`assistant/chunk` is the very event broadcast by the [Agent loop](07-agent) — the backend only does **subscribe to event → write to the response stream**:

<<< ../../mini-dsh/src/web.ts{58-92}

```ts
res.writeHead(200, {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
});
res.flushHeaders();

// subscribe to streaming deltas and push in real time (same event as the CLI typewriter)
const off = ctx.on("assistant/chunk")(({ delta }: any) => {
  if (typeof delta.content === "string") {
    res.write(`data: ${JSON.stringify({ delta: delta.content })}\n\n`);
  }
});
try {
  const reply = await agent.turn(String(message ?? ""));
  res.write(`data: ${JSON.stringify({ done: true, content: reply.content })}\n\n`);
} finally {
  off();
  res.end();
}
```

::: tip Critical details
- SSE needs `flushHeaders()` before writing data, or the browser never receives the first packet
- Subscribe **before `agent.turn()`**, dispose after (`off()`) — use it and lose it, no listener leaks
- On turn errors, write an `error` event instead of closing the connection, so the frontend can show a friendly message
:::

## Frontend: fetch + ReadableStream Parsing SSE

The page reads the response body with `getReader()`, parses `data:` events line by line:

```js
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";            // keep the incomplete trailing line for the next round
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const ev = JSON.parse(t.slice(5).trim());
    if (ev.delta) log.textContent += ev.delta;   // append character by character
    if (ev.done) log.textContent += "\n";
  }
}
```

Note the buffer handling: `buf` may hold a partial line, kept for the next round — the same trick as the backend parser in [chapter 05](05-llm), just moved into the browser.

## Run

```bash
pnpm web
# mini-dsh web: http://127.0.0.1:3080
```

Open `http://127.0.0.1:3080`, type a task and press Enter — you'll see the answer **stream in word by word**. Session state lives in the Agent's built-in `session`, so multi-turn conversations automatically carry history (projected via `deriveMessages()`).

::: tip Why port 3080?
The official `dsh web` defaults to 3080 — a little homage in mini-dsh.
:::

## Tests: The SSE Protocol Is Really Asserted

`test/web.test.ts` starts a real HTTP server and verifies the whole stream:

```ts
it("/api/chat streams deltas over SSE and ends with a done event", async () => {
  // ...scripted provider, real port...
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", ... });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const events = text.split("\n").filter(l => l.trim().startsWith("data:")).map(JSON.parse);
  expect(deltas.join("")).toBe("你好,这是流式回答!");  // deltas reassemble completely
  expect(deltas.length).toBeGreaterThan(1);            // genuinely streaming, not one-shot
  expect(done.done).toBe(true);                        // proper close
});
```

## Next Steps

- **Multi-session**: add a `session_id` param to `/api/chat`, look up sessions by id in `ctx.sessions`
- **Reasoning display**: the backend already pushes `reasoning_content`; the frontend can render it as grey "thinking" text
- **Stop button**: `AbortController` to cancel a turn

::: tip Recap
- The SSE upgrade = subscribe to `assistant/chunk` → write to the response stream; zero core changes
- Frontend ReadableStream parsing; the half-line buffer is the only gotcha
- `createChatServer` is independently testable; the SSE protocol is asserted by real tests
:::
