# 核心四:工具系统

> 对应官方:`core/tools` —— 作用域化工具注册表 + 受管执行管线

## 工具是什么

工具(Tool)是模型与外部世界的**唯一接口**。模型不能直接执行代码、读文件、发请求 —— 它只能「请求」调用某个工具,由 harness 代为执行并把结果回传。

一个工具 = 四件事:

```ts
export interface ToolDef {
  name: string;              // 模型用来调用你的名字
  description: string;       // 模型决定「什么时候用」的依据
  parameters: ToolParams;    // JSON Schema,模型据此生成参数
  run: (args: any) => unknown | Promise<unknown>;  // 真正干活的地方
}
```

`tool()` 是便捷构造器:

```ts
export function tool(
  name: string,
  description: string,
  parameters: ToolParams,
  run: ToolDef["run"],
): ToolDef {
  return { name, description, parameters, run };
}
```

## 为什么 schema 要显式声明

TS 的类型在运行时不存在,所以我们**显式写 JSON Schema**(OpenAI 函数调用格式)。这也是教学上更好的选择 —— 模型看到的和你写的是同一份:

```ts
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
  async ({ command, timeout }) => { /* ... */ },
)
```

::: info 官方怎么做?
官方用 zod 之类的运行时校验库做 schema 推导和参数校验。mini 版选择显式声明 + 参数 `any`,把「JSON Schema 是模型契约」这件事讲得更直白。要升级的话,在 `execute()` 里加一层 zod 校验即可。
:::

## 注册表:注册即逆效应

```ts
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  constructor(private ctx: Context) {}

  register(t: ToolDef): Disposer {
    this.tools.set(t.name, t);
    return () => {
      this.tools.delete(t.name);
    }; // 注销即逆效应
  }

  unregister(name: string): void { this.tools.delete(name); }
  get(name: string): ToolDef | undefined { return this.tools.get(name); }
  names(): string[] { return [...this.tools.keys()]; }

  /** 供 LLM 请求使用的函数调用 schema 列表 */
  schemas(): unknown[] {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
}
```

插件在 `apply(ctx)` 里注册工具、返回注销器 —— 插件卸载,工具自动消失。这就是「一切皆插件」在工具层的体现。

## 受管执行管线

工具执行不是简单的函数调用,它是一条**受管管线**,每个环节都可以被插件拦截:

```text
tools/pre-execute  (waterfall:策略插件可拒绝/改写参数)
      │
      ▼
    tool.run(args)          ← 真正执行
      │
      ▼
tools/execute      (emit:观察执行结果)
      │
      ▼
tools/post-execute (waterfall:插件可包装/改写结果)
```

```ts
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
```

这带来的能力是惊人的:

- **安全策略插件**:监听 `tools/pre-execute`,拦截危险命令、校验文件路径、限流
- **结果包装插件**:监听 `tools/post-execute`,给结果加时间戳、截断超长输出
- **审计插件**:监听 `tools/execute`,把每次调用写入数据库

而且这些插件**不需要改动一行核心代码** —— 这就是「没有特权核心」的收益。

## 测试验证

```ts
it("pre-execute waterfall 可以改写参数", async () => {
  tools.register(tool("add", "add", {...}, ({ a, b }) => a + b));
  // 策略插件:把所有参数放大 10 倍
  ctx.on("tools/pre-execute", "waterfall")((v: any, next: any) => {
    const args = { ...v.args, a: v.args.a * 10, b: v.args.b * 10 };
    return next({ ...v, args });
  });
  expect(await tools.execute("add", { a: 1, b: 2 })).toBe(30);  // 1+2 被改写为 10+20
});

it("post-execute waterfall 可以改写结果(如格式化)", async () => {
  ctx.on("tools/post-execute", "waterfall")((v: any, next: any) => {
    return next({ ...v, result: `结果是 ${v.result}` });
  });
  expect(await tools.execute("add", { a: 1, b: 2 })).toBe("结果是 3");
});
```

## 完整源码

<<< ../mini-dsh/src/tools.ts

::: tip 本章回顾
- 工具 = name + description + JSON Schema + run,是模型接触世界的唯一通道
- 注册表即服务,注销即逆效应
- 执行走受管管线,`pre-execute` / `post-execute` 两个 waterfall 让策略与审计完全不侵入核心

下一步:[Agent 循环 →](07-agent)
:::
