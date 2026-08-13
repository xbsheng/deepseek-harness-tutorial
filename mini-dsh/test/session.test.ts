import { describe, expect, it } from "vitest";
import { Session } from "../src/session.ts";

describe("会话事件日志", () => {
  it("deriveMessages 正确投影模型历史消息", () => {
    const s = new Session();
    s.append("user/message", { content: "帮我算 1+1" });
    s.append("assistant/message", {
      content: "",
      tool_calls: [{ id: "call_1", type: "function", function: { name: "run_bash", arguments: "{}" } }],
    });
    s.append("tool/result", { tool_call_id: "call_1", content: "2" });
    s.append("assistant/message", { content: "答案是 2" });

    const messages = s.deriveMessages();
    expect(messages).toEqual([
      { role: "user", content: "帮我算 1+1" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "call_1", type: "function", function: { name: "run_bash", arguments: "{}" } }],
      },
      { role: "tool", tool_call_id: "call_1", content: "2" },
      { role: "assistant", content: "答案是 2" },
    ]);
  });

  it("非消息事件(step/start 等)不进入模型上下文", () => {
    const s = new Session();
    s.append("turn/start", {});
    s.append("step/start", { step: 0 });
    s.append("user/message", { content: "hi" });
    s.append("assistant/chunk", { delta: { content: "h" } });
    s.append("assistant/message", { content: "hi!" });
    const roles = s.deriveMessages().map((m) => m.role);
    expect(roles).toEqual(["user", "assistant"]);
  });

  it("JSONL 持久化往返一致", () => {
    const s = new Session("abc");
    s.append("user/message", { content: "你好" });
    s.append("assistant/message", { content: "你好!" });
    const path = "/tmp/mini-dsh-test-session.jsonl";
    s.save(path);
    const loaded = Session.load(path);
    expect(loaded.id).toBe("abc");
    expect(loaded.events).toEqual(s.events);
  });
});
