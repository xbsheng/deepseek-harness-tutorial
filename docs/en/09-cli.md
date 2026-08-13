# CLI & Startup

> Official counterpart: the `dsh` CLI, `--profile headless` one-shot mode

Framework and plugins are in place. Now we give mini-dsh a "mouth": three run modes, mirroring the official's three usages.

## Mode Overview

| Command | What it does | Official counterpart |
|---|---|---|
| `npm run chat` | Interactive REPL, prints as it generates | `dsh` interactive mode |
| `npm run run "task"` | One-shot task execution, prints the result | `dsh --profile headless "task"` |
| `npm run web` | Starts the browser UI | `dsh web` |

## Implementation

<<< ../../mini-dsh/src/cli.ts

### chat: event-driven typewriter effect

```ts
async function chat(): Promise<void> {
  const { ctx, agent } = await buildAgent();
  // subscribe to streaming deltas and print as they arrive (event-driven UI)
  const off = ctx.on("assistant/chunk")(({ delta }: any) => {
    if (typeof delta.content === "string") process.stdout.write(delta.content);
  });
  const rl = createInterface({ input, output });
  console.log("mini-dsh chat — type exit to quit\n");
  for (;;) {
    const line = await rl.question("you> ");
    if (line.trim() === "exit" || line.trim() === "") break;
    const reply = await agent.turn(line);
    console.log(`\n\nmini-dsh> ${reply.content}\n`);
  }
  off();
  await ctx.stop();
  rl.close();
}
```

Note: `ctx.on("assistant/chunk")` subscribes to exactly the event broadcast by the [Agent loop](07-agent) via `ctx.emit("assistant/chunk")`. **The UI never touches the core loop — it only subscribes to events.** That's the direct payoff of the event-driven architecture.

### run: headless one-shot

```ts
async function run(task: string): Promise<void> {
  const { ctx, agent } = await buildAgent();
  const reply = await agent.turn(task);
  console.log(reply.content);
  await ctx.stop();
}
```

Two lines of core logic. Perfect for scripts, CI, and automation pipelines — exactly what the official headless profile does.

## Real Run Output

You can run it without an API key — use the scripted demo:

```bash
npx tsx demo.ts
```

Output (real execution — `run_bash` really invoked `echo 1+1 | bc`):

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

## Hooking Up the Real DeepSeek

```bash
export DEEPSEEK_API_KEY=sk-your-key
npm run run "write a bubble sort and save it to sort.py"

# or point at any OpenAI-compatible endpoint (local vLLM, gateway...)
export DEEPSEEK_BASE_URL=https://your-endpoint
npm run chat
```

::: tip Troubleshooting
- `缺少 DEEPSEEK_API_KEY` — you forgot to export, or the key is empty
- `DeepSeek API 401` — invalid key
- Network issues — check your proxy/firewall; is `DEEPSEEK_BASE_URL` reachable?

Next: [Testing & Verification →](10-test)
:::
