/**
 * skills 插件:Markdown 技能包 -> 工具。
 *
 * 官方概念:skill 是「可注入的指令包」。mini 版的实现路径:
 * 技能是 skills/ 目录下的 Markdown(带 frontmatter),经 use_skill 工具
 * 以工具结果的形式注入上下文 —— 模型自己决定何时调用它。
 * 这个路径让技能天然可审计、可组合,且不需要改动 agent 循环。
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { PluginDef } from "../src/context.ts";
import { tool, type ToolRegistry } from "../src/tools.ts";

export interface Skill {
  name: string;
  description: string;
  body: string;
}

/** 解析带 frontmatter 的 Markdown 技能文件 */
function parseSkill(file: string): Skill {
  const text = readFileSync(file, "utf8");
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) throw new Error(`技能文件缺少 frontmatter: ${file}`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { name: meta.name ?? file, description: meta.description ?? "", body: match[2].trim() };
}

export interface SkillsOptions {
  /** 技能目录,默认 ./skills */
  dir?: string;
}

export function skillsPlugin(opts: SkillsOptions = {}): PluginDef {
  const dir = join(process.cwd(), opts.dir ?? "skills");

  function loadAll(): Skill[] {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => parseSkill(join(dir, f)));
  }

  return {
    name: "skills",
    inject: ["tools"],
    apply: (ctx) => {
      const tools = ctx.get<ToolRegistry>("tools")!;
      const disposers = [
        tools.register(
          tool(
            "list_skills",
            "列出当前可用的技能及其用途说明。",
            { type: "object", properties: {}, required: [] },
            () => loadAll().map((s) => `- ${s.name}: ${s.description}`).join("\n") || "(没有技能)",
          ),
        ),
        tools.register(
          tool(
            "use_skill",
            "按名字加载一个技能的完整指令并开始执行它。返回技能正文,请据此完成任务。",
            {
              type: "object",
              properties: {
                name: { type: "string", description: "技能名(见 list_skills)" },
                task: { type: "string", description: "要用该技能完成的具体任务" },
              },
              required: ["name", "task"],
            },
            ({ name, task }: { name: string; task: string }) => {
              const skill = loadAll().find((s) => s.name === name);
              if (!skill) throw new Error(`未知技能: ${name}(可用: ${loadAll().map((s) => s.name).join(", ")})`);
              return `# 技能:${skill.name}\n${skill.body}\n\n# 当前任务\n${task}`;
            },
          ),
        ),
      ];
      return () => disposers.forEach((d) => d());
    },
  };
}
