/**
 * demo:脚本化端到端演示 —— 不发网络请求,展示完整 turn 流程。
 * 运行: npx tsx demo.ts
 * 换真实 DeepSeek: DEEPSEEK_API_KEY=xxx npx tsx src/cli.ts run "任务"
 */

import { buildAgent } from "./boot.ts";

const { ctx, agent } = await buildAgent({
  provider: "scripted",
  scriptedResponses: [
    {
      role: "assistant",
      content: "让我先算一下。",
      tool_calls: [
        {
          id: "call_1", type: "function",
          function: { name: "run_bash", arguments: '{"command":"echo 1+1 | bc"}' },
        },
      ],
    },
    { role: "assistant", content: "计算完成:1+1=2。" },
  ],
});

// 订阅流式增量,模拟 CLI 的实时输出
const off = ctx.on("assistant/chunk")(({ delta }: any) => {
  if (typeof delta.content === "string") process.stdout.write(delta.content);
});

const reply = await agent.turn("1+1 等于多少?用工具算一下");
console.log(`\n\n==== 最终回复: ${reply.content} ====`);
console.log("\n==== 会话日志(append-only SessionEvent)====");
for (const ev of agent.session.events) {
  const { type, ...rest } = ev;
  console.log(`  ${type.padEnd(20)} ${JSON.stringify(rest).slice(0, 120)}`);
}
console.log("\n==== deriveMessages() 投影给模型的上下文 ====");
for (const m of agent.session.deriveMessages()) {
  console.log(`  [${m.role}] ${JSON.stringify(m.content.slice(0, 60))}${m.tool_calls ? ` +tool_calls` : ""}`);
}

off();
await ctx.stop();
