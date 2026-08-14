# 环境准备与项目骨架

## 前置要求

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 18(推荐 22+) | 我们用 Node 内置的 `fetch`,不需要任何运行时依赖 |
| pnpm | 任意 | 官方也用 pnpm,我们跟着用 |

验证环境:

```bash
node --version   # v22.x
pnpm --version   # 10.x+
```

## 创建项目

```bash
mkdir mini-dsh && cd mini-dsh
pnpm init
pnpm add -D typescript tsx vitest @types/node
```

- `typescript` —— 类型检查(`tsc --noEmit`)
- `tsx` —— 直接运行 TS 源码(官方也用 tsx 从源码启动)
- `vitest` —— 测试框架(官方同款)
- `@types/node` —— Node 类型定义

## package.json

```json
{
  "name": "mini-dsh",
  "version": "0.1.0",
  "private": true,
  "description": "简易版 DeepSeek Harness:一切皆插件的 agent 执行层(TS 教学实现)",
  "type": "module",
  "scripts": {
    "chat": "tsx src/cli.ts chat",
    "run": "tsx src/cli.ts run",
    "web": "tsx src/cli.ts web",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

::: tip `"type": "module"` 是必须的
mini-dsh 全程 ESM,和官方一致。这也是我们能在 import 里写 `.ts` 扩展名、能被 tsx 直接运行的前提。
:::

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src", "plugins", "boot.ts", "test"]
}
```

几个关键点:

- `allowImportingTsExtensions: true` —— 允许 `import ... from "./context.ts"`,配合 tsx/vitest 直接跑源码
- `noEmit: true` —— 我们只做类型检查,运行交给 tsx,不产出 JS 文件
- `strict: true` —— 全程严格模式,和官方一致的工程标准

## 目录结构

```
mini-dsh/
├── package.json
├── tsconfig.json
├── src/                  # 核心库(框架本体)
│   ├── context.ts        # mini-Cordis:插件/服务/事件/可逆效应
│   ├── session.ts        # 会话事件日志 + 消息投影
│   ├── llm.ts            # LLM 适配器缝隙(DeepSeek + Scripted)
│   ├── tools.ts          # 工具注册表 + 受管执行管线
│   ├── agent.ts          # Agent 循环(turn/step)
│   ├── cli.ts            # dsh chat / run / web
│   └── web.ts            # 零依赖 Web UI(可选)
├── plugins/              # 插件层(能力,可插拔)
│   ├── system-prompt.ts  # 提示词片段服务
│   ├── shell.ts          # run_bash 工具
│   ├── filesystem.ts     # read_file / write_file(沙箱化)
│   └── skills.ts         # Markdown 技能包 -> 工具
├── skills/               # 技能目录
│   └── calculator.md
├── boot.ts               # 组装:注册服务 + 挂载插件(profile 思想)
├── demo.ts               # 脚本化端到端演示
└── test/                 # vitest 测试
    ├── context.test.ts
    ├── session.test.ts
    ├── tools.test.ts
    ├── llm.test.ts
    └── agent.test.ts
```

::: tip 和官方布局的对应
官方的 `packages/core/*`、`packages/llm/*` 对应我们的 `src/`;官方的能力包(`shell`、`fs`、`skill`)对应我们的 `plugins/`;官方的 `profile/bundle` 组装机制对应我们的 `boot.ts`。详见[附录对照表](reference/mapping)。
:::

## 第一个「跑起来」的插件

在写框架之前,先感受一下目标形态 —— 用 20 行代码验证工具链:

```ts
// hello.ts
import { Context } from "./src/context.ts";

const ctx = new Context();
ctx.service("greeting", { hello: (name: string) => `你好,${name}!` });

ctx.plugin({
  name: "main",
  inject: ["greeting"],
  apply: (c) => {
    console.log(c.get<{ hello: (n: string) => string }>("greeting")!.hello("mini-dsh"));
  },
});

await ctx.start(); // 依赖就绪后自动挂载 main 插件
await ctx.stop();  // 逆序回收
```

运行:

```bash
npx tsx hello.ts
# 你好,mini-dsh!
```

一个「插件」不过是一个 `{ name, inject, apply }` 对象:声明它需要什么服务,挂载时执行什么逻辑。这就是后面整个框架的原点 —— 下一章我们把它扩展成完整的事件系统。

::: warning 下一步需要 API Key?
第 2~9 章的所有代码都可以**无 Key 运行**(测试用 ScriptedProvider / mock 服务器)。
只有当你想要真实对话时,才需要设置:
```bash
export DEEPSEEK_API_KEY=sk-...
# 也可以指向任意 OpenAI 兼容端点
export DEEPSEEK_BASE_URL=https://api.deepseek.com
```
:::

下一步:[核心一:插件系统 mini-Cordis →](03-plugin)
