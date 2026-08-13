/**
 * dsh CLI:chat(交互 REPL)与 run(一次性执行)两种形态。
 * 官方:`dsh --profile headless "task"` 是单次任务,`dsh web` 是浏览器应用。
 */

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { buildAgent } from "../boot.ts";
import { web } from "./web.ts";

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

async function run(task: string): Promise<void> {
  const { ctx, agent } = await buildAgent();
  const reply = await agent.turn(task);
  console.log(reply.content);
  await ctx.stop();
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "chat") return chat();
  if (cmd === "run") return run(rest.join(" "));
  if (cmd === "web") return web(3080);
  console.error(`用法: dsh <chat|run "任务"|web>`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
