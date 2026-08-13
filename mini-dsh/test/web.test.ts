import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { buildAgent } from "../boot.ts";
import { createChatServer } from "../src/web.ts";

describe("Web UI(SSE 流式输出)", () => {
  let server: Server;

  afterEach(async () => {
    if (server) await new Promise((r) => server.close(r));
  });

  it("/api/chat 以 SSE 流推送增量,以 done 事件收尾", async () => {
    const { ctx, agent } = await buildAgent({
      provider: "scripted",
      scriptedResponses: [
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_1", type: "function",
            function: { name: "run_bash", arguments: '{"command":"echo hello"}' },
          }],
        },
        { role: "assistant", content: "你好,这是流式回答!" },
      ],
    });
    server = createChatServer(ctx, agent);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "说句话" }),
    });

    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();

    // 解析所有 SSE 事件
    const events = text
      .split("\n")
      .filter((l) => l.trim().startsWith("data:"))
      .map((l) => JSON.parse(l.trim().slice(5)));
    const deltas = events.filter((e) => typeof e.delta === "string").map((e) => e.delta);
    const done = events[events.length - 1];

    // 增量按 4 字切块推送("你好,这是流式回答!" -> 切块)
    expect(deltas.join("")).toBe("你好,这是流式回答!");
    expect(deltas.length).toBeGreaterThan(1); // 确实是分块流式,而非一次性
    expect(done.done).toBe(true);
    expect(done.content).toBe("你好,这是流式回答!");
    await ctx.stop();
  });

  it("回合出错时以 error 事件返回,而非中断连接", async () => {
    const { ctx, agent } = await buildAgent({ provider: "scripted", scriptedResponses: [] });
    server = createChatServer(ctx, agent);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(200); // SSE 通道本身不中断
    const text = await res.text();
    expect(text).toContain('"error"');
    await ctx.stop();
  });
});
