/**
 * LLM 适配器缝隙:DeepSeek(OpenAI 兼容)流式客户端 + 测试用脚本化 Provider。
 *
 * 官方概念:llm 是能力缝隙(seam),由 Service Definition(流词汇)+ Provider(实现)
 * 组成。换 Provider 不换产品:baseURL 指向任意 OpenAI 兼容端点即可。
 */

import type { ChatMessage, ToolCall } from "./session.ts";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

export class LLMError extends Error {}

/** Provider 缝隙:stream() 产出流事件 */
export interface LLMProvider {
  stream(messages: ChatMessage[], tools?: unknown[]): AsyncGenerator<StreamEvent>;
}

export type StreamEvent =
  | { type: "chunk"; delta: Record<string, unknown> }
  | { type: "message"; message: ChatMessage };

/** 便捷封装:消费完整流,返回最终消息 */
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

export interface DeepSeekOptions {
  baseURL?: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

/** DeepSeek 官方适配器:OpenAI 兼容 chat/completions,SSE 流式 */
export class DeepSeekProvider implements LLMProvider {
  readonly baseURL: string;
  readonly apiKey: string;
  readonly model: string;
  private timeoutMs: number;

  constructor(opts: DeepSeekOptions = {}) {
    this.baseURL = (opts.baseURL ?? process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.apiKey = opts.apiKey ?? process.env.DEEPSEEK_API_KEY ?? "";
    this.model = opts.model ?? DEFAULT_MODEL;
    this.timeoutMs = opts.timeoutMs ?? 180_000;
    // 注意:key 检查延迟到首次 stream(),让 dsh web 等形态可以无 key 启动
  }

  async *stream(messages: ChatMessage[], tools: unknown[] = []): AsyncGenerator<StreamEvent> {
    if (!this.apiKey) throw new LLMError("缺少 DEEPSEEK_API_KEY(环境变量或 opts.apiKey)");
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const resp = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ model: this.model, messages, tools, stream: true }),
        signal: ctrl.signal,
      });
      if (!resp.ok) {
        throw new LLMError(`DeepSeek API ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
      }
      if (!resp.body) throw new LLMError("响应没有 body");
      yield* parseSse(resp.body, resp.body.getReader(), new TextDecoder());
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 从 SSE 字节流解析 chat/completions 增量,重组为 chunk/message 流事件 */
async function* parseSse(
  _body: ReadableStream<Uint8Array>,
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder,
): AsyncGenerator<StreamEvent> {
  let buffer = "";
  const toolAcc: ToolCall[] = [];
  let contentAcc = "";
  let done = false;

  while (!done) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? ""; // 末尾不完整行留到下一轮

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        done = true; // 结束流,但还要产出最终 message 事件
        break;
      }
      let chunk: any;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk?.choices?.[0]?.delta ?? {};
      if (typeof delta.content === "string") {
        contentAcc += delta.content;
        yield { type: "chunk", delta: { content: delta.content } };
      }
      if (delta.reasoning_content) {
        yield { type: "chunk", delta: { reasoning_content: delta.reasoning_content } };
      }
      for (const tc of delta.tool_calls ?? []) {
        const idx: number = tc.index ?? 0;
        while (toolAcc.length <= idx) {
          toolAcc.push({ id: "", type: "function", function: { name: "", arguments: "" } });
        }
        toolAcc[idx].id += tc.id ?? "";
        toolAcc[idx].function.name += tc.function?.name ?? "";
        toolAcc[idx].function.arguments += tc.function?.arguments ?? "";
      }
    }
  }

  yield { type: "message", message: { role: "assistant", content: contentAcc, ...(toolAcc.length ? { tool_calls: toolAcc } : {}) } };
}

/** 脚本化 Provider:按脚本依次返回消息,测试与演示用,不发网络请求 */
export class ScriptedProvider implements LLMProvider {
  responses: ChatMessage[];
  constructor(responses: ChatMessage[]) {
    this.responses = [...responses];
  }

  async *stream(messages: ChatMessage[], _tools: unknown[] = []): AsyncGenerator<StreamEvent> {
    const message = this.responses.shift();
    if (!message) throw new LLMError("ScriptedProvider 脚本用尽");
    const content = message.content ?? "";
    for (let i = 0; i < content.length; i += 4) {
      yield { type: "chunk", delta: { content: content.slice(i, i + 4) } };
    }
    yield { type: "message", message };
  }
}
