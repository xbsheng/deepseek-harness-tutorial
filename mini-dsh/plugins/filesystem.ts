/**
 * filesystem 插件:read_file / write_file 工具,工作目录沙箱化。
 * 演示「策略即插件」:路径穿越防护直接写在工具边界上,模型不可绕过。
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import type { PluginDef } from "../src/context.ts";
import { tool, type ToolRegistry } from "../src/tools.ts";

export interface FsOptions {
  /** 允许访问的工作根目录,默认 process.cwd() */
  root?: string;
}

export function fsPlugin(opts: FsOptions = {}): PluginDef {
  const root = resolve(opts.root ?? process.cwd());

  /** 把模型给的路径解析并限制在 root 内,越界直接抛错 */
  function safePath(p: string): string {
    const abs = isAbsolute(p) ? p : join(root, p);
    const rel = relative(root, abs);
    if (rel.startsWith("..") || isAbsolute(rel)) {
      throw new Error(`路径越界(仅允许访问 ${root}): ${p}`);
    }
    return normalize(abs);
  }

  return {
    name: "filesystem",
    inject: ["tools"],
    apply: (ctx) => {
      const tools = ctx.get<ToolRegistry>("tools")!;
      const disposers = [
        tools.register(
          tool(
            "read_file",
            "读取工作目录内的文本文件,返回内容。路径相对工作目录或绝对路径。",
            {
              type: "object",
              properties: { path: { type: "string", description: "文件路径" } },
              required: ["path"],
            },
            ({ path }: { path: string }) => readFileSync(safePath(path), "utf8"),
          ),
        ),
        tools.register(
          tool(
            "write_file",
            "把内容写入工作目录内的文件(覆盖)。",
            {
              type: "object",
              properties: {
                path: { type: "string", description: "文件路径" },
                content: { type: "string", description: "要写入的内容" },
              },
              required: ["path", "content"],
            },
            ({ path, content }: { path: string; content: string }) => {
              const abs = safePath(path);
              mkdirSync(dirname(abs), { recursive: true });
              writeFileSync(abs, content, "utf8");
              return `已写入 ${path}(${content.length} 字符)`;
            },
          ),
        ),
      ];
      return () => disposers.forEach((d) => d());
    },
  };
}
