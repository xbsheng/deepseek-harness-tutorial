# Core 1: Plugin System (mini-Cordis)

> Official counterpart: [Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

The official harness builds "everything is a plugin" on top of Cordis. In this chapter we implement a mini-Cordis from scratch — it only does five things, but each one aligns with the official semantics.

## The Five Ideas, Mapped to Code

| Cordis idea | mini-Cordis API | Official counterpart |
|---|---|---|
| A plugin is an object implementing Service | `{ name, inject, apply }` | function plugins |
| A context is a repository of services | `ctx.service()` / `ctx.get()` | `ctx.<key>` |
| `inject` declares service dependencies | `inject: ["tools"]` | `inject` |
| Events with four dispatch modes | `ctx.on()` / `emit` / `waterfall` / `parallel` / `serial` | same |
| Registrations are reversible effects | `ctx.effect()` / reverse-order teardown | same |

## Types: Plugin and Service

```ts
export type Disposer = () => void | Promise<void>;

export interface PluginDef {
  name: string;
  /** Declared service dependencies; the plugin mounts once all are ready */
  inject?: string[];
  /** Mount logic; the returned cleanup function runs on unload (reverse order) */
  apply: (ctx: Context) => Disposer | void | Promise<Disposer | void>;
}
```

`inject` is the most elegant design in this framework: **plugins don't care about boot order, they only declare what they need; the framework mounts them once dependencies are ready.** This solves the classic "who initializes first" problem in monorepos.

## The Service Repository

```ts
/** Register a service, e.g. ctx.service('llm', provider) */
service<T>(key: string, obj: T): T {
  this.services.set(key, obj);
  return obj;
}

/** Get a service (nullable; in the official, optional services also use ctx.get) */
get<T = unknown>(key: string): T | undefined {
  return this.services.get(key) as T | undefined;
}
```

The official uses TypeScript declaration merging for typed dot access (`ctx.tools`); mini-Cordis uses `ctx.get("tools")` uniformly, with the type carried by generics:

```ts
const tools = ctx.get<ToolRegistry>("tools")!;
```

::: tip Why keys instead of direct imports?
Services decouple **definition** from **implementation**: `ctx` only knows string keys. Want a different tool registry? `ctx.service("tools", newImpl)` in one line, and every plugin that depends on `tools` is unaffected. That is the foundation of "no privileged core, everything swappable".
:::

## Mounting and Dependency Resolution

`start()` is a naive topological sort: repeatedly scan unmounted plugins, mount those whose dependencies are ready, until no progress (then report the missing services):

```ts
async start(): Promise<this> {
  const remaining = [...this.plugins];
  while (remaining.length) {
    let progressed = false;
    for (const p of [...remaining]) {
      const missing = (p.inject ?? []).filter((k) => !this.services.has(k));
      if (missing.length === 0) {
        await this.mount(p);
        remaining.splice(remaining.indexOf(p), 1);
        progressed = true;
      }
    }
    if (!progressed) {
      const detail = remaining.map((p) => ({
        name: p.name,
        missing: (p.inject ?? []).filter((k) => !this.services.has(k)),
      }));
      throw new Error(`Plugin dependencies unsatisfied: ${JSON.stringify(detail)}`);
    }
  }
  return this;
}
```

## Reversible Effects: Teardown in Reverse Mount Order

Every registration (tool, listener, prompt section) should be undoable. The framework pushes every plugin's cleanup function onto a stack, and `stop()` pops them in **reverse order**:

```ts
private async mount(p: PluginDef): Promise<void> {
  const applied = await p.apply(this);
  const disposer: Disposer = typeof applied === "function" ? applied : () => {};
  this.disposers.push(disposer);   // push
  this.mounted.add(p.name);
}

/** Unload all plugins: run each cleanup effect in reverse mount order */
async stop(): Promise<void> {
  for (const d of [...this.disposers].reverse()) await d();
  this.disposers = [];
  this.mounted.clear();
}
```

Why reverse? A later-mounted plugin may depend on services registered by an earlier one; unloading the later first avoids "cleanup referencing an already-gone service".

## Event Dispatch: Four Modes

This is the "nervous system" of the framework. We implement all four official modes:

### emit — observers (not awaited, return values ignored)

```ts
/** emit: observe in registration order, sync, return values ignored */
emit(name: string, payload: any = undefined): void {
  for (const l of this.listeners.get(name) ?? []) {
    if (l.mode === "emit") (l.fn as EmitListener)(payload);
  }
}
```

Typical use: the CLI subscribes to `assistant/chunk` to print as it streams; a metrics plugin observes `turn/end` to record duration.

### waterfall — around-middleware (the heart)

```ts
async waterfall<T>(name: string, value: T): Promise<T> {
  const chain = (this.listeners.get(name) ?? [])
    .filter((l) => l.mode === "waterfall")
    .map((l) => l.fn as WaterfallListener);

  const run = async (i: number, v: T): Promise<T> => {
    if (i >= chain.length) return v;
    let called = false;
    let downstream: Promise<T> | undefined;
    const next = (nv?: T): Promise<T> => {
      called = true;
      downstream = run(i + 1, nv !== undefined ? nv : v);
      return downstream;
    };
    const ret = (await chain[i](v, next)) as T;
    return called ? (await downstream!) : ret;
  };
  return run(0, value);
}
```

Waterfall has exactly two semantics:

1. A listener receives `(value, next)`; **calling `next(newValue?)` delegates to downstream**, and the downstream result comes back
2. **Returning without calling `next` short-circuits** — your return value becomes the final result

```ts
// Example: chained system-prompt assembly
ctx.on("system-prompt", "waterfall")((v, next) => next(`${v} section 2`));
ctx.on("system-prompt", "waterfall")((v, next) => next(`${v} section 3`));
await ctx.waterfall("system-prompt", "section 1"); // "section 1 section 2 section 3"

// Example: policy short-circuit — this listener decides outright
ctx.on("tools/pre-execute", "waterfall")((v) => {
  throw new Error("execution forbidden");  // reject
});
```

::: info Difference from the official
Official Cordis is the multi-argument `(...args, next)`; mini-Cordis simplifies to **single-value passing** (`value, next`). 90% of daily usage is "one value through a chain", and the single-value version keeps the code shorter and the teaching clearer. For the full story, read the official [Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md).
:::

### parallel — concurrent observation

```ts
/** parallel: all listeners observe concurrently */
async parallel(name: string, payload: any = undefined): Promise<void> {
  const jobs = (this.listeners.get(name) ?? [])
    .filter((l) => l.mode === "parallel")
    .map((l) => (l.fn as SerialListener)(payload));
  await Promise.all(jobs);
}
```

### serial — ordered, can stop

```ts
/** serial: run in registration order; a listener returning false stops the chain */
async serial(name: string, payload: any = undefined): Promise<void> {
  for (const l of this.listeners.get(name) ?? []) {
    if (l.mode === "serial" && (await (l.fn as SerialListener)(payload)) === false) {
      break;
    }
  }
}
```

Typical use (official scenario): `agent/turn-stopping` — several plugins decide "should this turn stop?" in order; any `false` halts. We use serial in the [Agent loop](07-agent).

## Full Source

<CodeGroup>
  <CodeGroupItem title="src/context.ts">

<<< ../../mini-dsh/src/context.ts

  </CodeGroupItem>
</CodeGroup>

## Test Coverage

Every mini-Cordis semantic is backed by a real test (`test/context.test.ts`):

```bash
npm test
```

<CodeGroup>
  <CodeGroupItem title="Key tests">

```ts
it("waterfall: returning without next() short-circuits", async () => {
  ctx.on("agent/request", "waterfall")((v: any, next: any) => next({ ...v, downstream: true }));
  ctx.on("agent/request", "waterfall")((v: any, next: any) => ({ ...v, intercepted: true }));
  const out = await ctx.waterfall("agent/request", { messages: [] });
  expect(out).toEqual({ messages: [], downstream: true, intercepted: true });
});

it("stop() runs cleanup effects in reverse mount order", async () => {
  // mount a -> b, teardown must be b -> a
  await ctx.start();
  await ctx.stop();
  expect(order).toEqual(["b-dispose", "a-dispose"]);
});
```

  </CodeGroupItem>
</CodeGroup>

```
 Test Files  6 passed (6)
      Tests  25 passed (25)
```

::: tip Recap
- A plugin = `{ name, inject, apply }`; dependencies drive mount order
- Services = a key-value repository, decoupling definition from implementation
- Four event modes each have a job: **emit observes, waterfall intercepts/rewrites, parallel fans out, serial arbitrates**
- Every registration is reversible; `stop()` unwinds in reverse order

Next: [Session Event Log →](04-session)
:::
