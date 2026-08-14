# Setup & Project Skeleton

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 (22+ recommended) | We use Node's built-in `fetch` — zero runtime dependencies |
| pnpm | any | The official uses pnpm too, so do we |

Verify:

```bash
node --version   # v22.x
pnpm --version   # 10.x+
```

## Create the Project

```bash
mkdir mini-dsh && cd mini-dsh
pnpm init
pnpm add -D typescript tsx vitest @types/node
```

- `typescript` — type checking (`tsc --noEmit`)
- `tsx` — run TS sources directly (the official also launches from source via tsx)
- `vitest` — test framework (same as the official)
- `@types/node` — Node type definitions

## package.json

```json
{
  "name": "mini-dsh",
  "version": "0.1.0",
  "private": true,
  "description": "A simplified DeepSeek Harness: an agent harness where everything is a plugin (TS teaching implementation)",
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

::: tip `"type": "module"` is required
mini-dsh is ESM end-to-end, like the official. This is also what lets us write `.ts` extensions in imports and run directly with tsx.
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

Key points:

- `allowImportingTsExtensions: true` — allows `import ... from "./context.ts"`, so tsx/vitest run the source directly
- `noEmit: true` — we only type-check; tsx does the running, no JS output
- `strict: true` — strict mode everywhere, the same engineering standard as the official

## Directory Layout

```
mini-dsh/
├── package.json
├── tsconfig.json
├── src/                  # Core library (framework itself)
│   ├── context.ts        # mini-Cordis: plugins/services/events/reversible effects
│   ├── session.ts        # Session event log + message projection
│   ├── llm.ts            # LLM adapter seam (DeepSeek + Scripted)
│   ├── tools.ts          # Tool registry + guarded execution pipeline
│   ├── agent.ts          # Agent loop (turn/step)
│   ├── cli.ts            # dsh chat / run / web
│   └── web.ts            # Zero-dependency Web UI (SSE streaming)
├── plugins/              # Plugin layer (capabilities, pluggable)
│   ├── system-prompt.ts  # Prompt section service
│   ├── shell.ts          # run_bash tool
│   ├── filesystem.ts     # read_file / write_file (sandboxed)
│   └── skills.ts         # Markdown skill packs -> tools
├── skills/               # Skill directory
│   └── calculator.md
├── boot.ts               # Assembly: register services + mount plugins (profile idea)
├── demo.ts               # Scripted end-to-end demo
└── test/                 # vitest tests
    ├── context.test.ts
    ├── session.test.ts
    ├── tools.test.ts
    ├── llm.test.ts
    ├── agent.test.ts
    └── web.test.ts
```

::: tip Mapping to the official layout
The official `packages/core/*` and `packages/llm/*` correspond to our `src/`; the official capability packages (`shell`, `fs`, `skill`) correspond to our `plugins/`; the official `profile/bundle` composition corresponds to our `boot.ts`. See the [appendix mapping](../en/reference/mapping) — or the [Chinese version](/reference/mapping).
:::

## Your First "Running" Plugin

Before writing the framework, feel the target shape — verify the toolchain with ~20 lines:

```ts
// hello.ts
import { Context } from "./src/context.ts";

const ctx = new Context();
ctx.service("greeting", { hello: (name: string) => `Hello, ${name}!` });

ctx.plugin({
  name: "main",
  inject: ["greeting"],
  apply: (c) => {
    console.log(c.get<{ hello: (n: string) => string }>("greeting")!.hello("mini-dsh"));
  },
});

await ctx.start(); // mounts main once its dependency is ready
await ctx.stop();  // unwinds in reverse order
```

Run:

```bash
npx tsx hello.ts
# Hello, mini-dsh!
```

A "plugin" is just a `{ name, inject, apply }` object: declare what services it needs, and what to do on mount. That is the origin of the entire framework — the next chapter extends it into a full event system.

::: warning Do you need an API key yet?
Everything in chapters 2–10 runs **without a key** (tests use ScriptedProvider / a mock server).
Only for real conversations do you need:
```bash
export DEEPSEEK_API_KEY=sk-...
# you can also point at any OpenAI-compatible endpoint
export DEEPSEEK_BASE_URL=https://api.deepseek.com
```
:::

Next: [Core 1: Plugin System (mini-Cordis) →](03-plugin)
