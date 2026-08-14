# 测试与验证

> 对应官方:`docs/testing.md` 的测试分层思想

## 测试策略:三层递进

| 层 | 测什么 | 用什么 | 需要 key? |
|---|---|---|---|
| 单元测试 | 插件语义、会话投影、工具管线 | 纯内存对象 | ❌ |
| 集成测试 | 完整 agent 回合、组装(boot) | ScriptedProvider | ❌ |
| 协议测试 | SSE 解析、HTTP 错误处理 | `node:http` mock 服务器 | ❌ |
| 冒烟测试 | 真实 DeepSeek 对话 | 真 API | ✅ |

**没有 key 也能测到 90%** —— 这是 ScriptedProvider 和 mock 服务器的功劳。

## 跑测试

```bash
pnpm test          # vitest run
pnpm typecheck    # tsc --noEmit
```

真实输出:

```
 Test Files  5 passed (5)
      Tests  23 passed (23)
```

## 各测试文件拆解

### test/context.test.ts —— 插件系统语义

覆盖:依赖顺序挂载、依赖缺失报错、逆序回收、waterfall 短路/委托、serial 中止、parallel 并发、监听器注销。这些是框架的地基,每条语义一个测试。

### test/session.test.ts —— 日志投影

```ts
it("deriveMessages 正确投影模型历史消息", () => {
  // 构建:user -> assistant(tool_calls) -> tool/result -> assistant
  expect(messages).toEqual([...]);  // 顺序、字段逐一断言
});

it("非消息事件(step/start 等)不进入模型上下文", () => {
  expect(roles).toEqual(["user", "assistant"]);
});
```

### test/tools.test.ts —— 工具管线

pre-execute 改写参数、post-execute 改写结果、注销即逆效应、未知工具抛错。

### test/llm.test.ts —— SSE 协议(重点)

起一个 `node:http` 服务器返回**真实 SSE 字节流**,验证解析器:

```ts
beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.end(responses.shift() ?? "");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as any).port;
});
```

三个用例:

1. **流式文本**:两个 content 增量 + `[DONE]` → chunk 逐段、最终 message 内容完整
2. **流式工具调用**:跨两个增量按 index 拼接 `id`/`name`/`arguments`(最容易写错的地方)
3. **HTTP 401**:错误响应抛 `LLMError` 并带上前 300 字符

::: tip 夹具怎么写才不出错?
手写带转义的 JSON 字符串极易出错(我们真实踩过坑)。**用 `JSON.stringify` 构造夹具**:
```ts
const chunk1 = JSON.stringify({
  choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "add", arguments: '{"a":' } }] } }],
});
```
程序生成的 JSON 一定是合法 JSON,测试只关心协议行为,不关心手写转义。
:::

### test/agent.test.ts —— 回合契约

用 ScriptedProvider 脚本化模型行为,断言**日志顺序、事件顺序、最终答案**:

```ts
const script = [
  { role: "assistant", content: "", tool_calls: [{ id: "call_1", type: "function",
      function: { name: "add", arguments: '{"a":1,"b":2}' } }] },
  { role: "assistant", content: "结果是 3" },
];
// ...
expect(types).toEqual(["user/message", "assistant/message", "tool/result", "assistant/message"]);
expect(events).toEqual(["turn/start", "step/start", "step/end", "step/start", "step/end", "turn/end"]);
```

还有两个边界用例:

- **工具出错**:`{"a":"oops"}` 触发类型错误 → `<tool error>` 写入日志,循环继续
- **maxSteps 兜底**:模型一直调用工具 → 3 步后强制停止,不无限循环

boot 集成测试则验证完整组装:scripted 模式走 `buildAgent()`,fs 插件**真实落盘**文件。

## 冒烟测试(需要 key)

```bash
export DEEPSEEK_API_KEY=sk-xxx
pnpm run run "1+1 等于多少?用 run_bash 工具算"
```

预期看到:模型请求工具 → `tool/result` 内容 `2` → 最终答案。整个链路(插件 → 循环 → LLM → 工具 → 日志)一次验证。

::: tip 本章回顾
- 四层测试:单元 / 集成 / 协议 / 冒烟,前三层零 key
- ScriptedProvider 脚本化模型行为,断言回合契约
- mock HTTP 服务器验证真实 SSE 字节流解析
- 夹具用 `JSON.stringify` 生成,不手写转义

下一步:[可选:Web UI →](11-web)
:::
