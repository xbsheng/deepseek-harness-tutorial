# 核心五:Agent 循环

> 对应官方:`core/agent-loop` —— turn/step 流程的默认驱动

这一章是整个 mini-dsh 的心脏。前面所有章节(插件、日志、LLM、工具)在这里汇合成一个能**自主干活**的循环。

## Turn 与 Step

官方定义:

> 一个 **step** 是一次模型请求加上它调用的工具;一个 **turn** 是零或多个 step。

```text
turn/start
  ├─ user/message 入日志
  ├─ step 0:模型请求 -> 模型说要调用 run_bash
  │    └─ 执行 run_bash -> tool/result 入日志
  ├─ step 1:模型请求(带着工具结果)-> 模型给出最终答案
  └─ turn/end
```

循环什么时候停?

1. 模型这轮**没有请求任何工具** → 有答案了,停
2. 达到 `maxSteps`(默认 8)→ 防死循环,停

## 实现:逐段拆解

### 入口与 turn 边界

```ts
async turn(userInput: string): Promise<ChatMessage> {
  const ctx = this.ctx;
  const session = this.session;
  const tools = ctx.get<ToolRegistry>("tools");

  ctx.emit("turn/start", { agent: this, session });
  session.append("turn/start", { agent: this.session.id });
  session.append("user/message", { content: userInput });
```

注意双写:**live 事件(`ctx.emit`)给观察者,持久事件(`session.append`)给日志**。官方把事件分成「会话事件(持久)」和「agent 事件(实时)」两个域,我们同样处理。

### step 循环:组装请求

```ts
for (let step = 0; step < this.maxSteps; step++) {
  ctx.emit("step/start", { step, session });
  session.append("step/start", { step });

  // 组装请求:system prompt(waterfall 可改写)+ 历史消息 + 工具 schema
  const systemPrompt = await ctx.waterfall("system-prompt", this.renderSystemPrompt());
  const messages = session.deriveMessages();
  if (systemPrompt) messages.unshift({ role: "system", content: systemPrompt });
  const request = await ctx.waterfall<{ messages: ChatMessage[]; tools: unknown[] }>(
    "agent/request",
    { messages, tools: tools?.schemas() ?? [] },
  );
```

三个关键设计:

1. **上下文永远从日志投影** —— `session.deriveMessages()`,日志是唯一事实来源
2. **`system-prompt` 是 waterfall** —— 任何插件可以往提示词里加一段(后面章节的技能注入、安全规则都走这里)
3. **`agent/request` 是 waterfall** —— 在请求发出前,插件可以整体改写消息和工具列表(官方同款事件名)

### 流式请求与事件

```ts
  // 流式请求:chunk 事件实时发出,message 事件为准
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

`chunk` 事件实时广播 —— CLI 和 Web UI 订阅它做打字机效果;`message` 事件是权威结果,写入日志。

### 工具执行与结果回写

```ts
  if (toolCalls.length === 0) {
    assistant = { role: "assistant", content };
    ctx.emit("step/end", { step, tool_calls: 0, session });
    session.append("step/end", { step, tool_calls: 0 });
    break;   // 没有工具调用 => 有答案了
  }

  // 执行模型要求的每个工具调用,结果写回日志
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

::: tip 工具出错不崩溃
工具抛错被捕获并写成 `<tool error: ...>` 的 `tool/result`。模型看到错误信息后**自己决定下一步** —— 可能是换个参数重试,也可能是向用户解释失败。这正是「修复(repair)」能力的最朴素形态:错误本身就是上下文的一部分。
:::

## 完整源码

<<< ../mini-dsh/src/agent.ts

## 与官方 turn flow 对照

| 官方 | mini-dsh | 说明 |
|---|---|---|
| `turn/start`(持久) | `session.append("turn/start")` + `ctx.emit` | 双写 |
| `agent/pre-step`(waterfall) | 简化合并 | 官方可拒绝/改写输入,mini 未单独实现 |
| `agent/request`(waterfall) | `ctx.waterfall("agent/request")` | 同款 |
| `llm/stream` | `provider.stream()` | 同款 |
| `assistant/chunk*` → `assistant/message` | 同款双事件 | 同款 |
| `tool/call*` → `tools/pre-execute` → `execute` → `post-execute` → `tool/result*` | `tools.execute()` + 三个事件 | 同款管线 |
| `agent/turn-stopping`(serial) | 未单独实现 | maxSteps 兜底 |
| `turn/end`(持久) | 同款 | |

官方还有一个我们故意没做的:`agent/pre-step`(认领输入时先让插件过目)。mini 版用 `agent/request` 一个 waterfall 覆盖了「请求可改写」这个核心场景,保持教学复杂度可控。

## 测试:一个完整回合

```ts
it("完整 turn:模型调用工具 -> 拿到结果 -> 给出最终答案", async () => {
  const { ctx, agent } = makeAgent([
    { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function",
        function: { name: "add", arguments: '{"a":1,"b":2}' } }] },
    { role: "assistant", content: "结果是 3" },
  ]);
  // ...订阅事件...
  const reply = await agent.turn("1+1=?");
  expect(reply.content).toBe("结果是 3");
  // 会话日志:user -> assistant(带工具调用) -> tool/result -> assistant
  expect(types).toEqual(["user/message", "assistant/message", "tool/result", "assistant/message"]);
  // 事件序列:两个 step
  expect(events).toEqual(["turn/start", "step/start", "step/end", "step/start", "step/end", "turn/end"]);
});
```

这条测试断言了整条链:日志顺序、事件顺序、最终答案 —— 一个 harness 的核心契约就浓缩在这三行断言里。

::: tip 本章回顾
- turn = 零或多个 step;step = 一次模型请求 + 工具
- 上下文从日志投影,请求可被 waterfall 改写
- 工具错误进入上下文,模型自己决定如何修复
- 测试用 ScriptedProvider 精确断言回合契约

下一步:[示例插件 →](08-plugins)
:::
