/**
 * boot:组装一个可运行的 mini-dsh(对应官方的 profile/bundle 思想)。
 *
 * 组装 = 注册服务 + 挂载插件。哪一层想要什么能力,就挂什么插件:
 * 想让它会写文件,挂 filesystem;想让它会执行命令,挂 shell。
 */

import { Agent } from "./src/agent.ts";
import { Context } from "./src/context.ts";
import { DeepSeekProvider, type DeepSeekOptions, ScriptedProvider } from "./src/llm.ts";
import { Sessions } from "./src/session.ts";
import { ToolRegistry } from "./src/tools.ts";
import { systemPromptPlugin } from "./plugins/system-prompt.ts";
import { shellPlugin } from "./plugins/shell.ts";
import { fsPlugin } from "./plugins/filesystem.ts";
import { skillsPlugin } from "./plugins/skills.ts";

export interface BootOptions {
  llm?: DeepSeekOptions;
  /** 测试/演示时传入脚本化 Provider,跳过真实 API */
  provider?: "deepseek" | "scripted";
  scriptedResponses?: import("./src/session.ts").ChatMessage[];
  /** 文件系统插件的工作根目录(默认 cwd) */
  fsRoot?: string;
  /** 技能目录(默认 ./skills) */
  skillsDir?: string;
}

export async function buildContext(opts: BootOptions = {}): Promise<Context> {
  const ctx = new Context();

  // ---- 服务层:插件依赖它们 ----
  ctx.service("tools", new ToolRegistry(ctx));
  ctx.service("sessions", new Sessions());
  ctx.service(
    "llm",
    opts.provider === "scripted"
      ? new ScriptedProvider(opts.scriptedResponses ?? [])
      : new DeepSeekProvider(opts.llm ?? {}),
  );

  // ---- 插件层:按需组合能力 ----
  ctx.plugin(systemPromptPlugin);
  ctx.plugin(shellPlugin);
  ctx.plugin(fsPlugin({ root: opts.fsRoot }));
  ctx.plugin(skillsPlugin({ dir: opts.skillsDir }));

  await ctx.start();
  return ctx;
}

/** 组装好上下文,并创建挂上 llm 服务的 Agent */
export async function buildAgent(opts: BootOptions = {}) {
  const ctx = await buildContext(opts);
  const llm = ctx.get<DeepSeekProvider | ScriptedProvider>("llm")!;
  return { ctx, agent: new Agent(ctx, { provider: llm }) };
}
