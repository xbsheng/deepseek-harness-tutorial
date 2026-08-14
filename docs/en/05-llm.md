# Core 3: LLM Adapter Seam

> Official counterpart: `llm/llm` (vocabulary & seam) + `llm-deepseek` (DeepSeek implementation)

## The Seam Concept

The official abstracts a "swappable capability" as a trio:

| Role | Responsibility | Official example |
|---|---|---|
| **Service Definition** | Declares the interface and stream vocabulary | `llm/llm` defines the `stream()` contract |
| **Provider** | Implements the interface | `llm-deepseek` calls the DeepSeek API |
| **Consumer** | Consumes the interface, usually a model-facing tool | The agent loop consumes `stream()` |

The payoff: **swap the provider, keep the product.** DeepSeek, OpenAI, a local vLLM, or a compatible gateway — as long as they implement the same `stream()` interface, the agent loop doesn't change a single line.

## The Provider Seam: Stream Event Vocabulary

```ts
/** Provider seam: stream() produces stream events */
export interface LLMProvider {
  stream(messages: ChatMessage[], tools?: unknown[]): AsyncGenerator<StreamEvent>;
}

export type StreamEvent =
  | { type: "chunk"; delta: Record<string, unknown> }
  | { type: "message"; message: ChatMessage };
```

Only two events:

- `chunk` — streaming delta (`content` / `reasoning_content` / tool-call fragments)
- `message` — the complete message (authoritative result, including `tool_calls`)

`complete()` is a convenience wrapper: consume the whole stream, return the final message:

```ts
export async function complete(
  provider: LLMProvider,
  messages: ChatMessage[],
  tools: unknown[] = [],
): Promise<ChatMessage> {
  let message: ChatMessage = { role: "assistant", content: "" };
  for await (const ev of provider.stream(messages, tools)) {
    if (ev.type === "message") message = ev.message;
  }
  return message;
}
```

## DeepSeekProvider: OpenAI-Compatible Client

DeepSeek's API is OpenAI-compatible: `POST {base_url}/chat/completions`. So our implementation needs **zero SDK dependencies** — just Node's built-in `fetch` plus an SSE parser:

<<< ../../mini-dsh/src/llm.ts{38-79}

Key design choices:

1. **Configurable `baseURL`** — default `https://api.deepseek.com`, overridable via `DEEPSEEK_BASE_URL`; point it at any OpenAI-compatible endpoint (local vLLM, gateway, proxy)
2. **Lazy key validation** — the constructor doesn't throw; the check happens on the first `stream()` call, so `dsh web` can boot without a key
3. **Timeout via AbortController** — aborts after 180s of silence

## SSE Parsing: the hardest, most valuable 40 lines

The streaming response of chat/completions is SSE (Server-Sent Events), one `data: {...}` per line:

```text
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

The parser must do three things: **split lines, reassemble content deltas, and stitch streaming tool calls by index**:

<<< ../../mini-dsh/src/llm.ts{82-135}

Streaming tool calls are the classic pitfall — the model emits `tool_calls` fragments **across multiple deltas**:

```text
delta 1: {"index":0,"id":"call_1","function":{"name":"add","arguments":"{\"a\":"}}
delta 2: {"index":0,"function":{"arguments":"1,\"b\":2}"}}
final:   {"id":"call_1","function":{"name":"add","arguments":"{\"a\":1,\"b\":2}"}}
```

So we maintain accumulator slots indexed by `index`, appending `id`/`name`/`arguments` piece by piece.

::: warning Don't forget: the message event must still be emitted after `[DONE]`
`[DONE]` only means the stream is over — the final **`message` event must still be produced**, or the agent loop will wait forever. This is a real bug we hit while writing tests.
:::

## ScriptedProvider: The Testing Bedrock

How do you develop without a key? A scripted provider returns messages from a pre-written script, with zero network:

```ts
export class ScriptedProvider implements LLMProvider {
  responses: ChatMessage[];
  constructor(responses: ChatMessage[]) { this.responses = [...responses]; }

  async *stream(messages: ChatMessage[], _tools: unknown[] = []): AsyncGenerator<StreamEvent> {
    const message = this.responses.shift();
    if (!message) throw new LLMError("ScriptedProvider 脚本用尽");
    const content = message.content ?? "";
    for (let i = 0; i < content.length; i += 4) {
      yield { type: "chunk", delta: { content: content.slice(i, i + 4) } }; // simulate streaming
    }
    yield { type: "message", message };
  }
}
```

Its value: the **agent loop, tool execution, and session log** can be tested deterministically in CI with no network and no key.

## Verifying the Real HTTP Path

Mock alone isn't enough — we also start a **local mock server** with `node:http` and push real SSE bytes through the whole path:

```ts
it("streaming text: chunks emitted piece by piece, final message complete", async () => {
  responses = [sse(
    '{"id":"x","choices":[{"delta":{"role":"assistant","content":"你"}}]}',
    '{"id":"x","choices":[{"delta":{"content":"好"}}]}',
    "[DONE]",
  )];
  const provider = new DeepSeekProvider({ baseURL: `http://127.0.0.1:${port}`, apiKey: "test" });
  const chunks: string[] = [];
  let finalContent = "";
  for await (const ev of provider.stream([])) {
    if (ev.type === "chunk") chunks.push(String(ev.delta.content));
    else finalContent = ev.message.content;
  }
  expect(chunks).toEqual(["你", "好"]);
  expect(finalContent).toBe("你好");
});
```

::: tip Hooking up a real API
```bash
export DEEPSEEK_API_KEY=sk-xxx
pnpm run run "write a bubble sort for me"
```
`base_url` can point at any OpenAI-compatible endpoint — that's the power of the seam.
:::

## Full Source

<<< ../../mini-dsh/src/llm.ts

::: tip Recap
- The provider seam is one `stream()` interface; swap implementations without touching the product
- SSE parsing does three things: split lines, reassemble content, stitch tool calls by index
- The `message` event must still be emitted after `[DONE]`
- ScriptedProvider + local mock server = full-path testing without a key

Next: [Tool System →](06-tools)
:::
