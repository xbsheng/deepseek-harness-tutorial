# 核心三:LLM 适配器缝隙

> 对应官方:`llm/llm`(词汇与缝隙)+ `llm-deepseek`(DeepSeek 实现)

## 缝隙(Seam)概念

官方把「可替换能力」定义为三件套:

| 角色 | 职责 | 官方例子 |
|---|---|---|
| **Service Definition** | 声明接口与流词汇 | `llm/llm` 定义 `stream()` 的输入输出 |
| **Provider** | 实现接口 | `llm-deepseek` 调 DeepSeek API |
| **Consumer** | 消费接口,通常是模型工具 | Agent 循环消费 `stream()` |

好处:**换 Provider 不换产品**。DeepSeek、OpenAI、本地 vLLM、兼容网关,只要实现同一个 `stream()` 接口,Agent 循环一行都不用改。

## Provider 缝隙:流事件词汇

```ts
/** Provider 缝隙:stream() 产出流事件 */
export interface LLMProvider {
  stream(messages: ChatMessage[], tools?: unknown[]): AsyncGenerator<StreamEvent>;
}

export type StreamEvent =
  | { type: "chunk"; delta: Record<string, unknown> }
  | { type: "message"; message: ChatMessage };
```

只有两种事件:

- `chunk` —— 流式增量(`content` / `reasoning_content` / 工具调用分片)
- `message` —— 完整消息(权威结果,含 `tool_calls`)

`complete()` 是便捷封装:消费完整流,返回最终消息:

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

## DeepSeekProvider:OpenAI 兼容客户端

DeepSeek 的 API 与 OpenAI 兼容,`POST {base_url}/chat/completions`。所以我们的实现**零 SDK 依赖**,只用 Node 内置 `fetch` + SSE 解析:

<<< ../mini-dsh/src/llm.ts{38-79}

关键设计:

1. **`baseURL` 可配置** —— 默认 `https://api.deepseek.com`,环境变量 `DEEPSEEK_BASE_URL` 可覆盖,指向任何 OpenAI 兼容端点(本地 vLLM、网关、代理都行)
2. **key 延迟校验** —— 构造函数不抛错,首次 `stream()` 才检查,让 `dsh web` 能无 key 启动
3. **超时用 AbortController** —— 180 秒无响应自动中断

## SSE 解析:最难也最有价值的 40 行

chat/completions 的流式响应是 SSE(Server-Sent Events),每行 `data: {...}`:

```text
data: {"choices":[{"delta":{"content":"你"}}]}

data: {"choices":[{"delta":{"content":"好"}}]}

data: [DONE]
```

解析器要做三件事:**按行切分、增量重组内容、按 index 拼接流式工具调用**:

<<< ../mini-dsh/src/llm.ts{82-135}

流式工具调用是最容易踩坑的地方 —— 模型会**跨多个增量**把 `tool_calls` 分片吐出来:

```text
增量1: {"index":0,"id":"call_1","function":{"name":"add","arguments":"{\"a\":"}}
增量2: {"index":0,"function":{"arguments":"1,\"b\":2}"}}
最终:  {"id":"call_1","function":{"name":"add","arguments":"{\"a\":1,\"b\":2}"}}
```

所以要按 `index` 维护累加槽位,把 `id`/`name`/`arguments` 逐段拼接。

::: warning 别忘了 `[DONE]` 之后还要产出 message
`[DONE]` 只表示流结束,**最终 `message` 事件必须照常产出**,否则 Agent 循环永远等不到结果。这是我们写测试时真实踩过的坑。
:::

## ScriptedProvider:测试的基石

没有 key 怎么开发?脚本化 Provider 按预置脚本逐次返回消息,不发任何网络请求:

```ts
export class ScriptedProvider implements LLMProvider {
  responses: ChatMessage[];
  constructor(responses: ChatMessage[]) { this.responses = [...responses]; }

  async *stream(messages: ChatMessage[], _tools: unknown[] = []): AsyncGenerator<StreamEvent> {
    const message = this.responses.shift();
    if (!message) throw new LLMError("ScriptedProvider 脚本用尽");
    const content = message.content ?? "";
    for (let i = 0; i < content.length; i += 4) {
      yield { type: "chunk", delta: { content: content.slice(i, i + 4) } }; // 模拟流式
    }
    yield { type: "message", message };
  }
}
```

它的价值:让 **Agent 循环、工具执行、会话日志**这些核心逻辑在没有网络、没有 key 的 CI 里被确定性测试。下一章的测试就是这么写的。

## 真实 HTTP 路径的验证

光有 mock 不够,我们还用 `node:http` 起了一个**本地 mock 服务器**,完整走一遍真实 SSE 字节流:

```ts
it("流式文本:chunk 逐段产出,最终 message 内容完整", async () => {
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

::: tip 对接真实 API
```bash
export DEEPSEEK_API_KEY=sk-xxx
npm run run "帮我写一个冒泡排序"
```
`base_url` 也可以指向任何 OpenAI 兼容端点 —— 这就是缝隙的威力。
:::

## 完整源码

<<< ../mini-dsh/src/llm.ts

::: tip 本章回顾
- Provider 缝隙 = `stream()` 一个接口,换实现不换产品
- SSE 解析三件事:切行、重组内容、按 index 拼工具调用
- `[DONE]` 之后必须产出最终 `message` 事件
- ScriptedProvider + 本地 mock 服务器 = 无 key 也能全链路测试

下一步:[工具系统 →](06-tools)
:::
