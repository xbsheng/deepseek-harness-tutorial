# Core 4: Tool System

> Official counterpart: `core/tools` — scoped tool registry + guarded execution pipeline

## What Is a Tool

A tool is the **only interface** between the model and the outside world. The model cannot execute code, read files, or send requests directly — it can only "request" a tool call, which the harness executes and returns the result of.

A tool is four things:

```ts
export interface ToolDef {
  name: string;              // the name the model uses to call it
  description: string;       // how the model decides WHEN to use it
  parameters: ToolParams;    // JSON Schema; the model generates arguments from it
  run: (args: any) => unknown | Promise<unknown>;  // where the actual work happens
}
```

`tool()` is the convenience constructor:

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

## Why Declare the Schema Explicitly

TypeScript types don't exist at runtime, so we **declare the JSON Schema explicitly** (OpenAI function-call format). This is also the better teaching choice — what the model sees is the same document you wrote:

```ts
tool(
  "run_bash",
  "Execute a command in the local shell (e.g. ls, cat, node); returns stdout and stderr.",
  {
    type: "object",
    properties: {
      command: { type: "string", description: "The shell command to run" },
      timeout: { type: "integer", description: "Timeout in seconds, default 30" },
    },
    required: ["command"],
  },
  async ({ command, timeout }) => { /* ... */ },
)
```

::: info How does the official do it?
The official uses runtime validation libraries like zod for schema derivation and argument validation. mini-dsh chooses explicit declaration + `any` args to make "JSON Schema is the model contract" unmistakable. To upgrade, add a zod validation layer inside `execute()`.
:::

## Registry: Registering Is a Reversible Effect

```ts
export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  constructor(private ctx: Context) {}

  register(t: ToolDef): Disposer {
    this.tools.set(t.name, t);
    return () => {
      this.tools.delete(t.name);
    }; // unregister = reversible effect
  }

  unregister(name: string): void { this.tools.delete(name); }
  get(name: string): ToolDef | undefined { return this.tools.get(name); }
  names(): string[] { return [...this.tools.keys()]; }

  /** Function-call schemas for the LLM request */
  schemas(): unknown[] {
    return [...this.tools.values()].map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
}
```

Plugins register tools inside `apply(ctx)` and return the disposer — unload the plugin, the tools disappear. That's "everything is a plugin" at the tool layer.

## The Guarded Execution Pipeline

Tool execution is not a plain function call; it's a **guarded pipeline** where every stage can be intercepted by a plugin:

```text
tools/pre-execute  (waterfall: policy plugins may reject / rewrite args)
      │
      ▼
    tool.run(args)          ← the actual work
      │
      ▼
tools/execute      (emit: observe the result)
      │
      ▼
tools/post-execute (waterfall: plugins may wrap / rewrite the result)
```

```ts
/** Guarded pipeline: pre-execute(waterfall) -> run -> execute(emit) -> post-execute(waterfall) */
async execute(name: string, args: Record<string, any>): Promise<unknown> {
  const t = this.tools.get(name);
  if (!t) throw new Error(`Unknown tool: ${name}`);
  // pre-execute is a waterfall: policy plugins can reject (throw) or rewrite args
  const pre = await this.ctx.waterfall<{ name: string; args: Record<string, any> }>(
    "tools/pre-execute",
    { name, args },
  );
  const result = await t.run(pre.args);
  this.ctx.emit("tools/execute", { name: pre.name, args: pre.args, result });
  // post-execute is a waterfall: plugins can wrap / rewrite the result
  const post = await this.ctx.waterfall<{ name: string; args: Record<string, any>; result: unknown }>(
    "tools/post-execute",
    { name: pre.name, args: pre.args, result },
  );
  return post.result;
}
```

The resulting superpowers:

- **Security policy plugin**: listen to `tools/pre-execute`, block dangerous commands, validate file paths, rate-limit
- **Result-wrapping plugin**: listen to `tools/post-execute`, add timestamps, truncate oversized output
- **Audit plugin**: listen to `tools/execute`, log every call to a database

And none of these touch a single line of core code — that's the payoff of "no privileged core".

## Test Coverage

```ts
it("pre-execute waterfall can rewrite arguments", async () => {
  tools.register(tool("add", "add", {...}, ({ a, b }) => a + b));
  // policy plugin: multiply every argument by 10
  ctx.on("tools/pre-execute", "waterfall")((v: any, next: any) => {
    const args = { ...v.args, a: v.args.a * 10, b: v.args.b * 10 };
    return next({ ...v, args });
  });
  expect(await tools.execute("add", { a: 1, b: 2 })).toBe(30);  // 1+2 rewritten to 10+20
});

it("post-execute waterfall can rewrite the result (e.g. formatting)", async () => {
  ctx.on("tools/post-execute", "waterfall")((v: any, next: any) => {
    return next({ ...v, result: `The result is ${v.result}` });
  });
  expect(await tools.execute("add", { a: 1, b: 2 })).toBe("The result is 3");
});
```

## Full Source

<<< ../../mini-dsh/src/tools.ts

::: tip Recap
- A tool = name + description + JSON Schema + run; it's the model's only channel to the world
- The registry is a service; unregistering is a reversible effect
- Execution goes through a guarded pipeline; the two waterfalls let policy and audit plug in without invading the core

Next: [Agent Loop →](07-agent)
:::
