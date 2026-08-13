import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { complete, DeepSeekProvider } from "../src/llm.ts";

/** 把一组 SSE data 行拼成 HTTP 响应体 */
function sse(...datas: string[]): string {
  return datas.map((d) => `data: ${d}\n\n`).join("");
}

describe("DeepSeekProvider(SSE 流解析)", () => {
  let server: Server;
  let port: number;
  let responses: string[];

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      res.end(responses.shift() ?? "");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as any).port;
  });

  afterAll(() => server.close());

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

  it("工具调用:跨增量按 index 拼接 id/name/arguments", async () => {
    // 用 JSON.stringify 构造夹具,避免手写转义出错
    const chunk1 = JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "add", arguments: '{"a":' } }] } }],
    });
    const chunk2 = JSON.stringify({
      choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '1,"b":2}' } }] } }],
    });
    responses = [sse(chunk1, chunk2, "[DONE]")];
    const provider = new DeepSeekProvider({ baseURL: `http://127.0.0.1:${port}`, apiKey: "test" });
    let toolCalls: any[] = [];
    for await (const ev of provider.stream([])) {
      if (ev.type === "message" && ev.message.tool_calls) toolCalls = ev.message.tool_calls;
    }
    expect(toolCalls).toEqual([{
      id: "call_1",
      type: "function",
      function: { name: "add", arguments: '{"a":1,"b":2}' },
    }]);
  });

  it("非 200 响应抛 LLMError 并带上前 300 字符", async () => {
    responses = ["oops"];
    server.removeAllListeners("request");
    server.on("request", (_req, res) => {
      res.writeHead(401);
      res.end("invalid api key");
    });
    const provider = new DeepSeekProvider({ baseURL: `http://127.0.0.1:${port}`, apiKey: "bad" });
    await expect(complete(provider, [])).rejects.toThrow(/401/);
  });
});
