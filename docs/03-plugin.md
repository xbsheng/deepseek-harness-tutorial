# 核心一:插件系统 mini-Cordis

> 对应官方:[Cordis 入门](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)

官方把「一切皆插件」建立在 Cordis 之上。这一章我们从零实现一个 mini-Cordis —— 它只做五件事,但每一件都和官方语义对齐。

## 五大思想的代码映射

| Cordis 思想 | mini-Cordis API | 官方对应 |
|---|---|---|
| 插件是实现 Service 的对象 | `{ name, inject, apply }` | 函数插件 |
| 上下文是服务的仓库 | `ctx.service()` / `ctx.get()` | `ctx.<key>` |
| inject 声明依赖 | `inject: ["tools"]` | `inject` |
| 事件驱动,四种分发模式 | `ctx.on()` / `emit` / `waterfall` / `parallel` / `serial` | 同左 |
| 注册是可逆效应 | `ctx.effect()` / 挂载逆序回收 | 同左 |

## 插件与服务的类型定义

```ts
export type Disposer = () => void | Promise<void>;

export interface PluginDef {
  name: string;
  /** 声明依赖的服务 key,全部就绪后才会挂载本插件 */
  inject?: string[];
  /** 挂载逻辑;返回的清理函数会在卸载时逆序执行 */
  apply: (ctx: Context) => Disposer | void | Promise<Disposer | void>;
}
```

`inject` 是本框架最优雅的设计:**插件不关心启动顺序,只声明需要什么;框架负责在依赖就绪后挂载它**。这解决了 monorepo 里最常见的「谁先初始化」难题。

## 服务仓库

```ts
/** 向上下文注册一个服务,如 ctx.service('llm', provider) */
service<T>(key: string, obj: T): T {
  this.services.set(key, obj);
  return obj;
}

/** 取服务(可空;官方中可选服务也是走 ctx.get) */
get<T = unknown>(key: string): T | undefined {
  return this.services.get(key) as T | undefined;
}
```

官方用 TS 声明合并实现了 `ctx.tools` 这种带类型的点访问;mini 版统一用 `ctx.get("tools")`,类型通过泛型保证:

```ts
const tools = ctx.get<ToolRegistry>("tools")!;
```

::: tip 为什么服务要用「键」而不是直接 import?
服务解耦了**定义**与**实现**:`ctx` 只认识字符串键。想换一个工具注册表实现?`ctx.service("tools", 新实现)` 一行搞定,所有依赖 `tools` 的插件无感知。这就是「没有特权核心,一切皆可替换」的基石。
:::

## 插件挂载与依赖解析

`start()` 是一个朴素的拓扑排序:反复扫描未挂载插件,把依赖已就绪的挂载掉,直到没有进展(此时还有插件未挂载 → 报错点名缺失的服务):

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
      throw new Error(`插件依赖未满足: ${JSON.stringify(detail)}`);
    }
  }
  return this;
}
```

## 可逆效应:挂载逆序回收

每一个注册动作(工具、监听器、服务片段)都应该能撤销。框架的做法是把所有插件的清理函数压进一个栈,`stop()` 时**逆序**弹出执行:

```ts
private async mount(p: PluginDef): Promise<void> {
  const applied = await p.apply(this);
  const disposer: Disposer = typeof applied === "function" ? applied : () => {};
  this.disposers.push(disposer);   // 入栈
  this.mounted.add(p.name);
}

/** 卸载全部插件:按挂载逆序执行每个插件的清理效应 */
async stop(): Promise<void> {
  for (const d of [...this.disposers].reverse()) await d();
  this.disposers = [];
  this.mounted.clear();
}
```

为什么逆序?因为后挂载的插件可能依赖先挂载插件注册的东西,先卸载后挂载的,避免「清理时引用已消失的服务」。

## 事件分发:四种模式

这是整个框架的「神经系统」。官方四种分发模式,我们逐一实现:

### emit —— 观察者(不等待,返回值被忽略)

```ts
/** emit:按注册顺序观察事件,同步调用,返回值被忽略 */
emit(name: string, payload: any = undefined): void {
  for (const l of this.listeners.get(name) ?? []) {
    if (l.mode === "emit") (l.fn as EmitListener)(payload);
  }
}
```

典型用途:CLI 订阅 `assistant/chunk` 边生成边打印;统计插件观察 `turn/end` 记录耗时。

### waterfall —— 环绕中间件(核心中的核心)

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

waterfall 是**环绕中间件**,语义只有两条:

1. 监听器收到 `(value, next)`;**调用 `next(新值?)` 把控制权交给下游**,下游的结果会传回来
2. **不调用 `next` 直接 return,即短路** —— 返回值成为最终结果

```ts
// 例:system-prompt 链式拼接
ctx.on("system-prompt", "waterfall")((v, next) => next(`${v} 第二段`));
ctx.on("system-prompt", "waterfall")((v, next) => next(`${v} 第三段`));
await ctx.waterfall("system-prompt", "第一段"); // "第一段 第二段 第三段"

// 例:策略短路 —— 这个监听器直接拍板,下游不再执行
ctx.on("tools/pre-execute", "waterfall")((v) => {
  throw new Error("禁止执行");  // 拒绝
});
```

::: info 与官方的差异
官方 Cordis 是 `(...args, next)` 的多参数版本;mini 版简化为**单值传递**(`value, next`)。日常使用 90% 的场景都是「一个值穿过一条链」,单值版本让代码更短、教学更清晰。想深入可以读官方的 [Cordis Primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md)。
:::

### parallel —— 并发观察

```ts
/** parallel:所有监听器并发观察 */
async parallel(name: string, payload: any = undefined): Promise<void> {
  const jobs = (this.listeners.get(name) ?? [])
    .filter((l) => l.mode === "parallel")
    .map((l) => (l.fn as SerialListener)(payload));
  await Promise.all(jobs);
}
```

### serial —— 有序可中止

```ts
/** serial:按注册顺序执行,任一监听器返回 false 即中止 */
async serial(name: string, payload: any = undefined): Promise<void> {
  for (const l of this.listeners.get(name) ?? []) {
    if (l.mode === "serial" && (await (l.fn as SerialListener)(payload)) === false) {
      break;
    }
  }
}
```

典型用途(官方场景):`agent/turn-stopping` —— 多个插件依次判断「这轮该不该停」,任何一个返回 false 就中止。我们会在 [Agent 循环](07-agent) 里用到 serial。

## 完整源码

<CodeGroup>
  <CodeGroupItem title="src/context.ts">

<<< ../mini-dsh/src/context.ts

  </CodeGroupItem>
</CodeGroup>

## 测试验证

mini-Cordis 的每个语义都有真实测试兜底(`test/context.test.ts`):

```bash
npm test
```

<CodeGroup>
  <CodeGroupItem title="关键测试摘录">

```ts
it("waterfall:不调 next 即短路,返回值成为最终结果", async () => {
  ctx.on("agent/request", "waterfall")((v: any, next: any) => next({ ...v, downstream: true }));
  ctx.on("agent/request", "waterfall")((v: any, next: any) => ({ ...v, intercepted: true }));
  const out = await ctx.waterfall("agent/request", { messages: [] });
  expect(out).toEqual({ messages: [], downstream: true, intercepted: true });
});

it("stop 按挂载逆序执行清理效应", async () => {
  // 挂载 a -> b,卸载顺序必须是 b -> a
  await ctx.start();
  await ctx.stop();
  expect(order).toEqual(["b-dispose", "a-dispose"]);
});
```

  </CodeGroupItem>
</CodeGroup>

```
 Test Files  5 passed (5)
      Tests  23 passed (23)
```

::: tip 本章回顾
- 插件 = `{ name, inject, apply }`,依赖驱动挂载顺序
- 服务 = 键值仓库,解耦定义与实现
- 四种事件模式各司其职:**emit 观察、waterfall 拦截改写、parallel 并发、serial 有序裁决**
- 一切注册皆可逆,`stop()` 逆序回收

下一步:[会话事件日志 →](04-session)
:::
