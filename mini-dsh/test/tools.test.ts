import { describe, expect, it } from "vitest";
import { Context } from "../src/context.ts";
import { ToolRegistry, tool } from "../src/tools.ts";

function makeCtx(): Context {
  const ctx = new Context();
  ctx.service("tools", new ToolRegistry(ctx));
  return ctx;
}

describe("工具系统", () => {
  it("注册后 schemas 输出 OpenAI 函数调用格式", () => {
    const ctx = makeCtx();
    const tools = ctx.get<ToolRegistry>("tools")!;
    tools.register(tool("add", "两数相加", {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    }, ({ a, b }: { a: number; b: number }) => a + b));
    expect(tools.schemas()).toEqual([{
      type: "function",
      function: {
        name: "add",
        description: "两数相加",
        parameters: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
      },
    }]);
  });

  it("register 返回的注销器即逆效应", () => {
    const ctx = makeCtx();
    const tools = ctx.get<ToolRegistry>("tools")!;
    const off = tools.register(tool("add", "add", { type: "object", properties: {}, required: [] }, () => 0));
    expect(tools.names()).toEqual(["add"]);
    off();
    expect(tools.names()).toEqual([]);
  });

  it("pre-execute waterfall 可以改写参数", async () => {
    const ctx = makeCtx();
    const tools = ctx.get<ToolRegistry>("tools")!;
    tools.register(tool("add", "add", {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    }, ({ a, b }: { a: number; b: number }) => a + b));
    // 策略插件:把所有参数放大 10 倍(演示拦截与改写)
    ctx.on("tools/pre-execute", "waterfall")((v: any, next: any) => {
      const args = { ...v.args, a: v.args.a * 10, b: v.args.b * 10 };
      return next({ ...v, args });
    });
    expect(await tools.execute("add", { a: 1, b: 2 })).toBe(30);
  });

  it("post-execute waterfall 可以改写结果(如格式化)", async () => {
    const ctx = makeCtx();
    const tools = ctx.get<ToolRegistry>("tools")!;
    tools.register(tool("add", "add", {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    }, ({ a, b }: { a: number; b: number }) => a + b));
    ctx.on("tools/post-execute", "waterfall")((v: any, next: any) => {
      return next({ ...v, result: `结果是 ${v.result}` });
    });
    expect(await tools.execute("add", { a: 1, b: 2 })).toBe("结果是 3");
  });

  it("未知工具抛错", async () => {
    const ctx = makeCtx();
    const tools = ctx.get<ToolRegistry>("tools")!;
    await expect(tools.execute("nope", {})).rejects.toThrow(/未知工具/);
  });
});
