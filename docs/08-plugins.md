# 组装:示例插件

> 对应官方:`skill` / `shell` / `fs` 能力包 + profile/bundle 组装

框架写完了,现在用四个真实插件演示「一切皆插件」的威力。每个插件都演示一种**注册模式**。

## 1. system-prompt:服务贡献 + 可逆效应

插件往 `ctx.systemPrompt` 服务里注册一段提示词片段,卸载时移除:

<<< ../mini-dsh/plugins/system-prompt.ts

```ts
export const systemPromptPlugin: PluginDef = {
  name: "system-prompt",
  apply: (ctx) => {
    const sp = ctx.get<SystemPrompt>("systemPrompt") ?? ctx.service("systemPrompt", new SystemPrompt());
    sp.addSection("identity", "你是 mini-dsh,...");
    return () => sp.removeSection("identity");  // 可逆效应
  },
};
```

`SystemPrompt` 服务(在 `src/agent.ts` 里)维护一个片段 Map,`render()` 拼成最终提示词:

```ts
export class SystemPrompt {
  private sections = new Map<string, string>();
  addSection(key: string, text: string): void { this.sections.set(key, text); }
  removeSection(key: string): void { this.sections.delete(key); }
  render(): string {
    return [...this.sections.entries()].map(([k, v]) => `## ${k}\n${v}`).join("\n\n");
  }
}
```

以后想加「安全规则」「输出格式」「工具使用指南」,都是新插件往这个服务里加片段 —— 核心循环零改动。

## 2. shell:能力即工具

能力(执行命令)以**工具形态**暴露给模型:

<<< ../mini-dsh/plugins/shell.ts

```ts
export const shellPlugin: PluginDef = {
  name: "shell",
  inject: ["tools"],                     // 声明依赖:工具注册表
  apply: (ctx) => {
    const tools = ctx.get<ToolRegistry>("tools")!;
    return tools.register(tool("run_bash", "在本地 shell 中执行一条命令...", {
      type: "object",
      properties: { command: { type: "string" }, timeout: { type: "integer" } },
      required: ["command"],
    }, async ({ command, timeout }) => {
      // execFile 而非 exec:参数不走 shell 解析,减少注入面
      const { stdout, stderr } = await execFileAsync("/bin/bash", ["-c", command], {
        timeout: (timeout ?? 30) * 1000, maxBuffer: 1024 * 1024,
      });
      return stdout.trim() || stderr.trim() || "(无输出)";
    }));
  },
};
```

::: danger 安全的边界
`run_bash` 是给模型的一把万能钥匙,mini 版直接放行(教学用途)。**生产环境必须把它放进沙箱** —— 这正是官方 `sandbox` / `e2b` 包存在的意义:沙箱作为 `ctx.sandbox` 服务,所有 spawn 动作都经它包装。能力越强,越需要策略层(见 `tools/pre-execute` 的用法)。
:::

## 3. filesystem:策略即插件

读写文件 + **路径沙箱**:模型给的任何路径都被解析并限制在工作根目录内,越界直接抛错:

<<< ../mini-dsh/plugins/filesystem.ts

```ts
/** 把模型给的路径解析并限制在 root 内,越界直接抛错 */
function safePath(p: string): string {
  const abs = isAbsolute(p) ? p : join(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`路径越界(仅允许访问 ${root}): ${p}`);
  }
  return normalize(abs);
}
```

为什么叫「策略即插件」?因为防护写在**工具边界**上 —— 模型无论怎么构造路径(`../etc/passwd`、绝对路径、符号链接),都过不了 `safePath` 这一关,不存在「换个说法就绕过」的旁路。官方称之为「在做出决定的那个操作里强制执行」。

## 4. skills:Markdown 技能包 -> 工具

技能是 `skills/*.md`(frontmatter + 正文):

```markdown
---
name: calculator
description: 用 Node.js 计算数学表达式,适合四则运算、百分比、单位换算等
---

# 计算器技能

1. 把用户的算式转换成安全的 JavaScript 表达式...
2. 用 node -e "console.log(<表达式>)" 执行并读取输出
...
```

插件把它们变成两个工具:`list_skills`(查看有哪些技能)和 `use_skill(name, task)`(加载技能正文执行):

<<< ../mini-dsh/plugins/skills.ts

```ts
tools.register(tool(
  "use_skill",
  "按名字加载一个技能的完整指令并开始执行它。返回技能正文,请据此完成任务。",
  { type: "object", properties: { name: {...}, task: {...} }, required: ["name", "task"] },
  ({ name, task }) => {
    const skill = loadAll().find((s) => s.name === name);
    if (!skill) throw new Error(`未知技能: ${name}`);
    return `# 技能:${skill.name}\n${skill.body}\n\n# 当前任务\n${task}`;
  },
));
```

这个设计的精妙之处:**技能正文通过工具结果进入上下文** —— 它走的是最普通的 `tool/result` 通道,不需要改动 agent 循环的任何一行。技能天然可审计(每次使用都留在日志里)、可组合、可热更新(改 md 即生效)。模型的调用序列会是:

```text
assistant: 让我先看看有什么技能 -> tool:list_skills
assistant: 用户要计算,加载计算器技能 -> tool:use_skill(name=calculator)
assistant: 按技能步骤执行 -> tool:run_bash(node -e ...)
assistant: 给出最终答案
```

## 组装:boot.ts(官方 profile 思想的简化)

官方一个运行的 `dsh` 是「按层组合出来的插件树」,由 profile 声明挂哪些 bundle。mini 版把它简化成一个 `boot.ts`:

<<< ../mini-dsh/boot.ts

```ts
export async function buildContext(opts: BootOptions = {}): Promise<Context> {
  const ctx = new Context();
  // ---- 服务层:插件依赖它们 ----
  ctx.service("tools", new ToolRegistry(ctx));
  ctx.service("sessions", new Sessions());
  ctx.service("llm", /* DeepSeek 或 Scripted */);
  // ---- 插件层:按需组合能力 ----
  ctx.plugin(systemPromptPlugin);
  ctx.plugin(shellPlugin);
  ctx.plugin(fsPlugin({ root: opts.fsRoot }));
  ctx.plugin(skillsPlugin({ dir: opts.skillsDir }));
  await ctx.start();
  return ctx;
}
```

「想让它会写文件,挂 `fsPlugin`;想让它会执行命令,挂 `shellPlugin`」 —— 能力即插即拔,这正是「Everything is a Plugin」的日常形态。`provider: "scripted"` 选项让整个组装可以在没有 key 的环境里跑起来(测试、CI、演示全靠它)。

::: tip 本章回顾
- 四种注册模式:服务贡献(提示词)、能力即工具(shell)、策略即插件(路径沙箱)、内容即工具(技能)
- 技能通过 `tool/result` 通道注入上下文,零改动核心循环
- boot.ts 是 profile 思想的简化:服务打底、插件按需组合

下一步:[CLI 与启动 →](09-cli)
:::
