# 可选:Web UI(SSE 流式)

> 对应官方:`dsh web` + `apps/web`(浏览器应用)

官方最有辨识度的体验是 `npx @deepseek-ai/dsh web` 打开的浏览器界面。mini 版用 `node:http` 写一个**零依赖**的版本 —— 一个页面 + 一个 SSE 接口,浏览器里与 agent 对话,**边生成边渲染**,就像官方产品一样。

## 架构:两个关键设计

1. **`createChatServer(ctx, agent)` 独立可测** —— 传入组装好的上下文与 agent,返回 HTTP 服务器。测试可以直接用 ScriptedProvider 启动它,验证完整 SSE 流。
2. **`/api/chat` 是 SSE 事件流** —— 不是「发一次等全部」的请求-响应,而是:

```text
data: {"delta":"你"}              ← 增量内容
data: {"delta":"好"}
data: {"delta":"!"}
data: {"done":true,"content":"你好!"}  ← 回合结束,附最终全文
data: {"error":"..."}             ← 出错(通道不中断)
```

## 后端:订阅事件,实时推送

`assistant/chunk` 事件正是 [Agent 循环](07-agent) 里广播的 —— 后端做的只是**订阅事件 → 写入响应流**:

<<< ../mini-dsh/src/web.ts{58-92}

```ts
res.writeHead(200, {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
});
res.flushHeaders();

// 订阅流式增量,实时推送(与 CLI 打字机同款事件)
const off = ctx.on("assistant/chunk")(({ delta }: any) => {
  if (typeof delta.content === "string") {
    res.write(`data: ${JSON.stringify({ delta: delta.content })}\n\n`);
  }
});
try {
  const reply = await agent.turn(String(message ?? ""));
  res.write(`data: ${JSON.stringify({ done: true, content: reply.content })}\n\n`);
} finally {
  off();
  res.end();
}
```

::: tip 关键细节
- SSE 必须 `flushHeaders()` 后再写数据,否则浏览器等不到首包
- 订阅要**在 `agent.turn()` 之前**注册,结束后注销(`off()`)—— 即用即走,不泄漏监听器
- 回合出错时写 `error` 事件而不是断开连接,前端能友好提示
:::

## 前端:fetch + ReadableStream 解析 SSE

页面用 `fetch` 拿到响应体后,`getReader()` 逐块读取,按行解析 `data:` 事件:

```js
const reader = r.body.getReader();
const dec = new TextDecoder();
let buf = "";
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  buf += dec.decode(value, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop() ?? "";            // 末尾不完整行留到下一轮
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("data:")) continue;
    const ev = JSON.parse(t.slice(5).trim());
    if (ev.delta) log.textContent += ev.delta;   // 一个字一个字往上加
    if (ev.done) log.textContent += "\n";
  }
}
```

注意缓冲区的处理:`buf` 里可能残留半行,要留到下一轮拼完 —— 和 [05 章](05-llm) 后端解析 SSE 是同一个套路,只是搬到了浏览器里。

## 运行

```bash
pnpm web
# mini-dsh web: http://127.0.0.1:3080
```

浏览器打开 `http://127.0.0.1:3080`,输入任务回车 —— 你会看到回答**逐字流式**出现在页面上。会话状态由 Agent 内置的 `session` 持有,多轮对话自动带上历史上下文。

::: tip 为什么端口是 3080?
官方 `dsh web` 默认端口就是 3080 —— mini-dsh 向官方致敬的小彩蛋。
:::

## 测试:SSE 协议被真实断言

`test/web.test.ts` 起真实 HTTP 服务器验证整条流:

```ts
it("/api/chat 以 SSE 流推送增量,以 done 事件收尾", async () => {
  // ...scripted provider + 真实监听端口...
  const res = await fetch(`http://127.0.0.1:${port}/api/chat`, { method: "POST", ... });
  expect(res.headers.get("content-type")).toContain("text/event-stream");
  const events = text.split("\n").filter(l => l.trim().startsWith("data:")).map(JSON.parse);
  expect(deltas.join("")).toBe("你好,这是流式回答!");  // 分块拼接完整
  expect(deltas.length).toBeGreaterThan(1);            // 确实是流式,不是一次性
  expect(done.done).toBe(true);                        // 正常收尾
});
```

## 升级方向

- **多会话**:`/api/chat` 加 `session_id` 参数,用 `ctx.sessions` 按 id 取会话
- **reasoning 展示**:后端已在推 `reasoning_content`,前端可以把它渲染成灰色「思考过程」
- **停止按钮**:`AbortController` 中止回合

::: tip 本章回顾
- SSE 升级 = 订阅 `assistant/chunk` 事件 → 写入响应流,核心循环零改动
- 前端 ReadableStream 解析,半行缓冲是唯一的小坑
- `createChatServer` 独立可测,SSE 协议被测试真实断言
:::
