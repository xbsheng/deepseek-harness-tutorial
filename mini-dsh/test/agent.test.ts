import { existsSync, rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Agent } from "../src/agent.ts";
import { Context } from "../src/context.ts";
import { ScriptedProvider } from "../src/llm.ts";
import { Sessions, type ChatMessage } from "../src/session.ts";
import { ToolRegistry, tool } from "../src/tools.ts";
import { buildAgent } from "../boot.ts";

function makeAgent(script: ChatMessage[]) {
  const ctx = new Context();
  ctx.service("tools", new ToolRegistry(ctx));
  ctx.service("sessions", new Sessions());
  ctx.plugin({
    name: "system-prompt",
    apply: (c) => {
      c.service("systemPrompt", {
        render: () => "你是 mini-dsh。",
      });
    },
  });
  ctx.plugin({
    name: "calc",
    inject: ["tools"],
    apply: (c) => {
      const t = c.get<ToolRegistry>("tools")!;
      return t.register(tool("add", "两数相加", {
        type: "object",
        properties: { a: { type: "number" }, b: { type: "number" } },
        required: ["a", "b"],
      }, ({ a, b }: { a: number; b: number }) => a + b));
    },
  });
  return { ctx, agent: new Agent(ctx, { provider: new ScriptedProvider(script) }) };
}

describe("Agent 循环", () => {
  it("完整 turn:模型调用工具 -> 拿到结果 -> 给出最终答案", async () => {
    const { ctx, agent } = makeAgent([
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_1", type: "function",
          function: { name: "add", arguments: '{"a":1,"b":2}' },
        }],
      },
      { role: "assistant", content: "结果是 3" },
    ]);

    const events: string[] = [];
    ctx.on("turn/start")(() => events.push("turn/start"));
    ctx.on("step/start")(() => events.push("step/start"));
    ctx.on("step/end")(() => events.push("step/end"));
    ctx.on("turn/end")(() => events.push("turn/end"));

    const reply = await agent.turn("1+1=?");
    expect(reply.content).toBe("结果是 3");

    // 会话日志:user -> assistant(带工具调用) -> tool/result -> assistant
    // (过滤掉 assistant/chunk 与 step 生命周期事件,只看模型可见消息序列)
    const types = agent.session.events
      .filter((e) => ["user/message", "assistant/message", "tool/result"].includes(e.type))
      .map((e) => e.type);
    expect(types).toEqual(["user/message", "assistant/message", "tool/result", "assistant/message"]);
    // 两个 step:第一个产出工具调用,第二个产出最终答案
    const allTypes = agent.session.events.map((e) => e.type);
    expect(allTypes.filter((t) => t === "step/end")).toHaveLength(2);
    expect(events).toEqual(["turn/start", "step/start", "step/end", "step/start", "step/end", "turn/end"]);
  });

  it("工具抛错时以 <tool error> 写入日志,循环继续", async () => {
    const { agent } = makeAgent([
      {
        role: "assistant",
        content: "",
        tool_calls: [{
          id: "call_x", type: "function",
          function: { name: "add", arguments: '{"a":"oops"}' },
        }],
      },
      { role: "assistant", content: "工具出错了" },
    ]);
    const reply = await agent.turn("会出错吗");
    expect(reply.content).toBe("工具出错了");
    const toolResult = agent.session.events.find((e) => e.type === "tool/result")!;
    expect(String(toolResult.content)).toContain("<tool error");
  });

  it("达到 maxSteps 后停止", async () => {
    const script: ChatMessage[] = [];
    for (let i = 0; i < 10; i++) {
      script.push({
        role: "assistant",
        content: "",
        tool_calls: [{
          id: `call_${i}`, type: "function",
          function: { name: "add", arguments: '{"a":1,"b":1}' },
        }],
      });
    }
    const { agent } = makeAgent(script);
    const a = new Agent(agent.ctx, { provider: new ScriptedProvider(script), maxSteps: 3 });
    await a.turn("一直调用工具");
    const steps = a.session.events.filter((e) => e.type === "step/start").length;
    expect(steps).toBe(3);
  });
});

describe("boot 集成", () => {
  it("scripted 模式走完整组装:fs 插件真实落盘", async () => {
    const dir = "/tmp/mini-dsh-it";
    rmSync(dir, { recursive: true, force: true });
    const { ctx, agent } = await buildAgent({
      provider: "scripted",
      fsRoot: dir,
      scriptedResponses: [
        {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_1", type: "function",
            function: { name: "write_file", arguments: '{"path":"hello.txt","content":"你好"}' },
          }],
        },
        { role: "assistant", content: "文件已写入" },
      ],
    });
    const reply = await agent.turn("写个文件");
    expect(reply.content).toBe("文件已写入");
    expect(existsSync(`${dir}/hello.txt`)).toBe(true);
    await ctx.stop();
  });
});
