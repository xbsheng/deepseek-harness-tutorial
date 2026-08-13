/**
 * mini-Cordis:插件、服务、事件与可逆效应。
 *
 * 对应官方 DeepSeek Harness 的 Cordis 五大思想:
 * 1. 插件是实现 Service 的对象(此处为 { name, inject, apply })
 * 2. 上下文是服务的仓库(ctx.get('tools') / 'llm' / 'sessions')
 * 3. inject 声明服务依赖,加载顺序由依赖关系推导
 * 4. 事件分发模式:emit / waterfall / parallel / serial
 * 5. 注册是可逆效应:ctx.stop() 按挂载逆序回收
 */

export type Disposer = () => void | Promise<void>;

export interface PluginDef {
  name: string;
  /** 声明依赖的服务 key,全部就绪后才会挂载本插件 */
  inject?: string[];
  /** 挂载逻辑;返回的清理函数会在卸载时逆序执行 */
  apply: (ctx: Context) => Disposer | void | Promise<Disposer | void>;
}

type EmitListener = (payload: any) => void;
type SerialListener = (payload: any) => boolean | void | Promise<boolean | void>;

export class Context {
  private services = new Map<string, unknown>();
  private plugins: PluginDef[] = [];
  private listeners = new Map<string, { mode: string; fn: any }[]>();
  private disposers: Disposer[] = [];
  private mounted = new Set<string>();

  // ---------- 服务仓库 ----------

  /** 向上下文注册一个服务,如 ctx.service('llm', provider) */
  service<T>(key: string, obj: T): T {
    this.services.set(key, obj);
    return obj;
  }

  /** 取服务(可空;官方中可选服务也是走 ctx.get) */
  get<T = unknown>(key: string): T | undefined {
    return this.services.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.services.has(key);
  }

  // ---------- 插件 ----------

  plugin(def: PluginDef): void {
    this.plugins.push(def);
  }

  /** 按依赖顺序挂载全部插件;依赖未满足则报错 */
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

  private async mount(p: PluginDef): Promise<void> {
    const applied = await p.apply(this);
    const disposer: Disposer = typeof applied === "function" ? applied : () => {};
    this.disposers.push(disposer);
    this.mounted.add(p.name);
  }

  /** 卸载全部插件:按挂载逆序执行每个插件的清理效应 */
  async stop(): Promise<void> {
    for (const d of [...this.disposers].reverse()) await d();
    this.disposers = [];
    this.mounted.clear();
  }

  /** 把任意清理逻辑注册为可逆效应 */
  effect(disposer: Disposer): Disposer {
    this.disposers.push(disposer);
    return disposer;
  }

  // ---------- 事件 ----------

  /** 注册事件监听,返回注销器。mode 决定分发方式 */
  on(name: string, mode: "emit" | "waterfall" | "parallel" | "serial" = "emit") {
    const listeners = this.listeners.get(name) ?? [];
    this.listeners.set(name, listeners);
    return (fn: EmitListener | SerialListener | WaterfallListener) => {
      const entry = { mode, fn };
      listeners.push(entry);
      return () => {
        const i = listeners.indexOf(entry);
        if (i >= 0) listeners.splice(i, 1);
      };
    };
  }

  /** emit:按注册顺序观察事件,同步调用,返回值被忽略 */
  emit(name: string, payload: any = undefined): void {
    for (const l of this.listeners.get(name) ?? []) {
      if (l.mode === "emit") (l.fn as EmitListener)(payload);
    }
  }

  /** parallel:所有监听器并发观察 */
  async parallel(name: string, payload: any = undefined): Promise<void> {
    const jobs = (this.listeners.get(name) ?? [])
      .filter((l) => l.mode === "parallel")
      .map((l) => (l.fn as SerialListener)(payload));
    await Promise.all(jobs);
  }

  /** serial:按注册顺序执行,任一监听器返回 false 即中止 */
  async serial(name: string, payload: any = undefined): Promise<void> {
    for (const l of this.listeners.get(name) ?? []) {
      if (l.mode === "serial" && (await (l.fn as SerialListener)(payload)) === false) {
        break;
      }
    }
  }

  /**
   * waterfall:环绕中间件。
   * 监听器收到 (value, next):调用 next(新值?) 把控制权交给下游并取回结果;
   * 不调用 next 直接 return,即短路,其返回值成为最终结果。
   * 注:官方 Cordis 是 (...args, next),mini 版简化为单值传递。
   */
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
}

type WaterfallListener = (value: any, next: (nv?: any) => Promise<any>) => any;
