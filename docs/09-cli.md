# CLI 与启动

> 对应官方:`dsh` CLI、`--profile headless` 单次任务模式

框架和插件就位了,现在给 mini-dsh 装上「嘴巴」:三种运行形态,对应官方三种用法。

## 形态总览

| 命令 | 说明 | 对应官方 |
|---|---|---|
| `npm run chat` | 交互式 REPL,边生成边打印 | `dsh` 交互模式 |
| `npm run run "任务"` | 一次性执行任务,打印结果 | `dsh --profile headless "task"` |
| `npm run web` | 启动浏览器 UI | `dsh web` |

## 实现

<<< ../mini-dsh/src/cli.ts

### chat:事件驱动的打字机效果

```ts
async function chat(): Promise<void> {
  const { ctx, agent } = await buildAgent();
  // 订阅流式增量,边生成边打印(演示事件驱动 UI)
  const off = ctx.on("assistant/chunk")(({ delta }: any) => {
    if (typeof delta.content === "string") process.stdout.write(delta.content);
  });
  const rl = createInterface({ input, output });
  console.log("mini-dsh chat — 输入 exit 退出\n");
  for (;;) {
    const line = await rl.question("你> ");
    if (line.trim() === "exit" || line.trim() === "") break;
    const reply = await agent.turn(line);
    console.log(`\n\nmini-dsh> ${reply.content}\n`);
  }
  off();
  await ctx.stop();
  rl.close();
}
```

注意:`ctx.on("assistant/chunk")` 订阅的正是 [Agent 循环](07-agent) 里 `ctx.emit("assistant/chunk")` 广播的事件。**UI 不碰核心循环,只订阅事件** —— 这就是事件驱动架构的直接收益。

### run:headless 单次执行

```ts
async function run(task: string): Promise<void> {
  const { ctx, agent } = await buildAgent();
  const reply = await agent.turn(task);
  console.log(reply.content);
  await ctx.stop();
}
```

两行核心逻辑。适合脚本调用、CI、自动化管道 —— 官方 headless profile 干的就是这件事。

## 真实运行效果

没有 API key 也能跑 —— 用脚本化演示:

```bash
npx tsx demo.ts
```

输出(真实执行,`run_bash` 真的调用了 `echo 1+1 | bc`):

```text
让我先算一下。计算完成:1+1=2。

==== 最终回复: 计算完成:1+1=2。 ====

==== 会话日志(append-only SessionEvent)====
  turn/start           {"seq":0,"ts":...,"agent":"5a1b896f-beb"}
  user/message         {"seq":1,"content":"1+1 等于多少?用工具算一下"}
  step/start           {"seq":2,"step":0}
  assistant/message    {"seq":5,"content":"让我先算一下。","tool_calls":[...run_bash...]}
  tool/result          {"seq":6,"tool_call_id":"call_1","content":"2"}
  step/end             {"seq":7,"step":0,"tool_calls":1}
  step/start           {"seq":8,"step":1}
  assistant/message    {"seq":12,"content":"计算完成:1+1=2。","tool_calls":[]}
  step/end             {"seq":13,"step":1,"tool_calls":0}
  turn/end             {"seq":14}
```

## 接上真实 DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-你的key
npm run run "帮我写一个冒泡排序,并保存到 sort.py"

# 或者指定任意 OpenAI 兼容端点(本地 vLLM、兼容网关...)
export DEEPSEEK_BASE_URL=https://你的端点
npm run chat
```

::: tip 故障排查
- `缺少 DEEPSEEK_API_KEY` —— 忘了 export,或 key 为空
- `DeepSeek API 401` —— key 无效
- 网络不通 —— 检查代理/防火墙;`DEEPSEEK_BASE_URL` 是否可达

下一步:[测试与验证 →](10-test)
:::
