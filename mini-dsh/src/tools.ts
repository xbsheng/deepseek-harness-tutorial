/**
 * 工具系统:注册表 + JSON Schema + 受管执行管线。
 *
 * 官方概念:ctx.tools 是作用域化的工具注册表,执行走受管管线
 * tools/pre-execute(waterfall,可拒绝/改写) -> execute -> tools/post-execute(waterfall,可改写结果)。
 */

import type { Context, Disposer } from "./context.ts";

export interface ToolParams {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  /** 显式 JSON Schema(OpenAI 函数调用格式) */
  parameters: ToolParams;
  /** 参数在运行时由 JSON 解析而来,mini 版不引入 zod 之类校验,参数类型为 any */
  run: (args: any) => unknown | Promise<unknown>;
}

/** 便捷构造器:name/description/parameters/run 一目了然 */
export function tool(
  name: string,
  description: string,
  parameters: ToolParams,
  run: ToolDef["run"],
): ToolDef {
  return { name, description, parameters, run };
}

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  constructor(private ctx: Context) {}

  register(t: ToolDef): Disposer {
    this.tools.set(t.name, t);
    return () => {
      this.tools.delete(t.name);
    }; // 注销即逆效应
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  names(): string[] {
    return [...this.tools.keys()];
  }

  /** 供 LLM 请求使用的函数调用 schema 列表 */
  schemas(): unknown[] {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  /** 受管执行管线:pre-execute(waterfall) -> run -> execute(emit) -> post-execute(waterfall) */
  async execute(name: string, args: Record<string, any>): Promise<unknown> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`未知工具: ${name}`);
    // pre-execute 是 waterfall:策略插件可以拒绝(抛错)或改写参数
    const pre = await this.ctx.waterfall<{ name: string; args: Record<string, any> }>(
      "tools/pre-execute",
      { name, args },
    );
    const result = await t.run(pre.args);
    this.ctx.emit("tools/execute", { name: pre.name, args: pre.args, result });
    // post-execute 是 waterfall:插件可以包装/改写结果
    const post = await this.ctx.waterfall<{ name: string; args: Record<string, any>; result: unknown }>(
      "tools/post-execute",
      { name: pre.name, args: pre.args, result },
    );
    return post.result;
  }
}
