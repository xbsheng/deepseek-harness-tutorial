# 核心二:会话事件日志

> 对应官方:`core/session` 子系统 ——「会话日志是模型所见上下文的唯一来源」

## 核心思想:模型可见的,必须已入日志

Agent 和普通聊天最大的区别是**过程复杂**:模型会多次请求、调用工具、拿到结果再继续。如果我们只保存「最终对话」,就无法回答这些问题:

- 模型当时看到了什么?(审计)
- 上一步工具返回了什么?(回放)
- 中断了怎么续跑?(恢复)
- 界面怎么渲染流式输出?(UI)

官方给出的答案是:**一切以追加式事件日志为准**。任何要进入模型请求的内容,必须先写成一条会话事件;模型的历史消息(`deriveMessages()`)是从日志**投影**出来的,而不是另外维护一份。

```text
user/message ──► assistant/message(tool_calls) ──► tool/result ──► assistant/message
      └──────────────── 日志(ground truth) ────────────────┘
                              │
                              ▼ deriveMessages()
                   模型实际看到的 messages 数组
```

## 事件类型

| 事件类型 | 持久化 | 作用 |
|---|---|---|
| `turn/start` / `turn/end` | ✅ | 一轮对话的边界 |
| `step/start` / `step/end` | ✅ | 一个 step 的边界(一次模型请求+工具) |
| `user/message` | ✅ | 用户输入,进入模型上下文 |
| `assistant/chunk` | ✅ | 流式增量(回放/UI 保真用) |
| `assistant/message` | ✅ | 完整 assistant 消息(含 tool_calls),进入模型上下文 |
| `tool/result` | ✅ | 工具结果,进入模型上下文 |

::: tip 为什么要存 `assistant/chunk`?
`assistant/message` 是最终结果,`chunk` 是过程。日志里保留 chunk,界面就能精确重放「当时是怎么一个字一个字打出来的」。官方称之为「保留回放与 UI 保真」。
:::

## 实现

### 追加式日志

<<< ../mini-dsh/src/session.ts{10-50}

要点:

- `append()` 自动加 `seq`(序号)和 `ts`(时间戳),事件不可修改 —— 这就是「追加式」
- `deriveMessages()` 只关心三种消息事件,把日志投影成模型能直接消费的数组

### 消息投影

<<< ../mini-dsh/src/session.ts{52-70}

注意 `assistant/message` 的投影:有 `tool_calls` 就带上;`tool/result` 通过 `tool_call_id` 和 assistant 的工具调用配对 —— 这是 OpenAI 兼容协议的硬性要求,顺序不能乱:

```ts
// 模型看到的(必须严格遵守的顺序)
[
  { role: "user", content: "1+1 等于多少?" },
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", function: { name: "run_bash", arguments: "..." } }] },
  { role: "tool", tool_call_id: "call_1", content: "2" },
  { role: "assistant", content: "答案是 2" },
]
```

### 持久化:JSONL

<<< ../mini-dsh/src/session.ts{72-99}

每条事件一行 JSON,首行存会话元信息(id)。追加式日志天然适合 JSONL:恢复会话只需逐行读入,写回只需追加。

### 会话注册表

<<< ../mini-dsh/src/session.ts{101-115}

对应官方 `ctx.sessions`,管理多个会话(Web UI 多会话、断点续跑都靠它)。

## 一次真实运行的日志

这是 `npm run demo`(脚本化演示)产出的**真实会话日志**:

```text
turn/start           {"agent":"5a1b896f-beb"}
user/message         {"content":"1+1 等于多少?用工具算一下"}
step/start           {"step":0}
assistant/chunk      {"delta":{"content":"让我先算"}}
assistant/chunk      {"delta":{"content":"一下。"}}
assistant/message    {"content":"让我先算一下。","tool_calls":[{"id":"call_1",...}]}
tool/result          {"tool_call_id":"call_1","content":"2"}
step/end             {"step":0,"tool_calls":1}
step/start           {"step":1}
assistant/chunk      {"delta":{"content":"计算完成"}}
assistant/chunk      {"delta":{"content":":1+1"}}
assistant/chunk      {"delta":{"content":"=2。"}}
assistant/message    {"content":"计算完成:1+1=2。","tool_calls":[]}
step/end             {"step":1,"tool_calls":0}
turn/end             {}
```

`tool/result` 里的 `"2"` 不是编的 —— 那是 `run_bash` 真实执行 `echo 1+1 | bc` 的结果。

::: warning 一条工程铁律
任何新进入模型上下文的输入(比如后面章节的「技能注入」),都必须**先入日志、再进请求**。如果绕过日志直接拼进 messages,回放和审计就失真了。官方用运行时断言强制这条规则,我们靠纪律。
:::

## 测试验证

```ts
it("deriveMessages 正确投影模型历史消息", () => {
  // ...构建日志...
  expect(messages).toEqual([...]); // 顺序、字段逐一断言

it("非消息事件(step/start 等)不进入模型上下文", () => {
  // turn/start、step/start、assistant/chunk 都被过滤
  expect(roles).toEqual(["user", "assistant"]);
});
```

::: tip 本章回顾
- 日志是**唯一事实来源**,上下文从日志投影
- 消息事件 `user/message` / `assistant/message` / `tool/result` 进入模型,其余事件只服务回放与审计
- JSONL 持久化让会话可恢复、可续跑

下一步:[LLM 适配器缝隙 →](05-llm)
:::
