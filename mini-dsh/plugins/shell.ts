/**
 * shell 插件:提供 run_bash 工具,让模型能在本地执行命令。
 * 演示「能力缝隙」:能力(执行命令)以工具形态暴露给模型。
 * 注意:真实部署应把 shell 放进沙箱(官方用 sandbox/e2b 等后端)。
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PluginDef } from "../src/context.ts";
import { tool, type ToolRegistry } from "../src/tools.ts";

const execFileAsync = promisify(execFile);

export const shellPlugin: PluginDef = {
  name: "shell",
  inject: ["tools"],
  apply: (ctx) => {
    const tools = ctx.get<ToolRegistry>("tools")!;
    return tools.register(
      tool(
        "run_bash",
        "在本地 shell 中执行一条命令(如 ls、cat、node),返回 stdout 与 stderr。",
        {
          type: "object",
          properties: {
            command: { type: "string", description: "要执行的 shell 命令" },
            timeout: { type: "integer", description: "超时秒数,默认 30" },
          },
          required: ["command"],
        },
        async ({ command, timeout }: { command: string; timeout?: number }) => {
          try {
            const { stdout, stderr } = await execFileAsync("/bin/bash", ["-c", command], {
              timeout: (timeout ?? 30) * 1000,
              maxBuffer: 1024 * 1024,
            });
            const out = stdout.trim();
            const err = stderr.trim();
            if (out && err) return `stdout:\n${out}\n\nstderr:\n${err}`;
            return out || err || "(无输出)";
          } catch (err: any) {
            const detail = err.stderr || err.message || String(err);
            return `<run_bash 失败: ${detail.slice(0, 500)}>`;
          }
        },
      ),
    );
  },
};
