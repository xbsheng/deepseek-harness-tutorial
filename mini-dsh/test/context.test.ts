import { describe, expect, it } from "vitest";
import { Context } from "../src/context.ts";

describe("mini-Cordis", () => {
  it("插件按 inject 依赖顺序挂载,先依赖后本体", async () => {
    const order: string[] = [];
    const ctx = new Context();
    ctx.service("tools", {});
    ctx.plugin({
      name: "base",
      apply: () => {
        order.push("base");
      },
    });
    ctx.plugin({
      name: "shell",
      inject: ["tools"],
      apply: () => {
        order.push("shell");
      },
    });
    await ctx.start();
    expect(order).toEqual(["base", "shell"]);
  });

  it("依赖未满足时启动报错并点名缺失服务", async () => {
    const ctx = new Context();
    ctx.plugin({ name: "x", inject: ["不存在的服务"], apply: () => {} });
    await expect(ctx.start()).rejects.toThrow(/不存在的服务/);
  });

  it("stop 按挂载逆序执行清理效应", async () => {
    const order: string[] = [];
    const ctx = new Context();
    ctx.plugin({
      name: "a",
      apply: () => () => {
        order.push("a-dispose");
      },
    });
    ctx.plugin({
      name: "b",
      apply: () => () => {
        order.push("b-dispose");
      },
    });
    await ctx.start();
    await ctx.stop();
    expect(order).toEqual(["b-dispose", "a-dispose"]);
  });

  it("waterfall:不调 next 即短路,返回值成为最终结果", async () => {
    const ctx = new Context();
    ctx.on("agent/request", "waterfall")((v: any, next: any) => {
      return next({ ...v, downstream: true });
    });
    ctx.on("agent/request", "waterfall")((v: any, next: any) => {
      return { ...v, intercepted: true }; // 短路:下游被截断
    });
    const out = await ctx.waterfall("agent/request", { messages: [] });
    expect(out).toEqual({ messages: [], downstream: true, intercepted: true });
  });

  it("waterfall:调 next 时下游结果通过 next 的返回值传播", async () => {
    const ctx = new Context();
    ctx.on("system-prompt", "waterfall")((v: string, next: any) => {
      return next(`${v} 第二段`);
    });
    ctx.on("system-prompt", "waterfall")((v: string, next: any) => {
      return next(`${v} 第三段`);
    });
    expect(await ctx.waterfall("system-prompt", "第一段")).toBe("第一段 第二段 第三段");
  });

  it("serial:按序执行,监听器返回 false 即中止", async () => {
    const calls: string[] = [];
    const ctx = new Context();
    ctx.on("agent/turn-stopping", "serial")(() => {
      calls.push("1");
      return undefined;
    });
    ctx.on("agent/turn-stopping", "serial")(() => {
      calls.push("2");
      return false;
    });
    ctx.on("agent/turn-stopping", "serial")(() => {
      calls.push("3");
    });
    await ctx.serial("agent/turn-stopping", {});
    expect(calls).toEqual(["1", "2"]);
  });

  it("parallel:所有监听器并发执行并等待", async () => {
    let n = 0;
    const ctx = new Context();
    ctx.on("step/end", "parallel")(async () => {
      await new Promise((r) => setTimeout(r, 10));
      n++;
    });
    ctx.on("step/end", "parallel")(async () => {
      n++;
    });
    await ctx.parallel("step/end", {});
    expect(n).toBe(2);
  });

  it("on 返回的注销器移除监听", async () => {
    let count = 0;
    const ctx = new Context();
    const off = ctx.on("turn/end")(() => count++);
    ctx.emit("turn/end", {});
    off();
    ctx.emit("turn/end", {});
    expect(count).toBe(1);
  });
});
