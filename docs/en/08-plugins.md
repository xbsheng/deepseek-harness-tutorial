# Assembly: Example Plugins

> Official counterpart: `skill` / `shell` / `fs` capability packages + profile/bundle composition

The framework is done. Now four real plugins demonstrate "everything is a plugin" — each one shows a **registration pattern**.

## 1. system-prompt: Service Contribution + Reversible Effect

The plugin registers a prompt section into the `ctx.systemPrompt` service and removes it on unload:

<<< ../../mini-dsh/plugins/system-prompt.ts

```ts
export const systemPromptPlugin: PluginDef = {
  name: "system-prompt",
  apply: (ctx) => {
    const sp = ctx.get<SystemPrompt>("systemPrompt") ?? ctx.service("systemPrompt", new SystemPrompt());
    sp.addSection("identity", "你是 mini-dsh,...");
    return () => sp.removeSection("identity");  // reversible effect
  },
};
```

The `SystemPrompt` service (in `src/agent.ts`) keeps a section map and `render()` assembles the final prompt:

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

Want to add "safety rules", "output format", or "tool usage guide"? Each is just a new plugin adding a section — the core loop stays untouched.

## 2. shell: Capability as a Tool

A capability (running commands) is exposed to the model **in tool form**:

<<< ../../mini-dsh/plugins/shell.ts

```ts
export const shellPlugin: PluginDef = {
  name: "shell",
  inject: ["tools"],                     // declares its dependency: the tool registry
  apply: (ctx) => {
    const tools = ctx.get<ToolRegistry>("tools")!;
    return tools.register(tool("run_bash", "Execute a command in the local shell...", {
      type: "object",
      properties: { command: { type: "string" }, timeout: { type: "integer" } },
      required: ["command"],
    }, async ({ command, timeout }) => {
      // execFile rather than exec: arguments never go through shell parsing, smaller injection surface
      const { stdout, stderr } = await execFileAsync("/bin/bash", ["-c", command], {
        timeout: (timeout ?? 30) * 1000, maxBuffer: 1024 * 1024,
      });
      return stdout.trim() || stderr.trim() || "(no output)";
    }));
  },
};
```

::: danger Know the boundary
`run_bash` is a master key handed to the model; mini-dsh lets it through directly (for teaching). **Production must put it inside a sandbox** — that's exactly what the official `sandbox` / `e2b` packages exist for: the sandbox is a `ctx.sandbox` service that wraps every spawn. The stronger the capability, the more it needs a policy layer (see `tools/pre-execute`).
:::

## 3. filesystem: Policy as a Plugin

Read/write files + **path sandboxing**: every path the model gives is resolved and confined to the workspace root; anything outside throws:

<<< ../../mini-dsh/plugins/filesystem.ts

```ts
/** Resolve a model-provided path and confine it to root; throw if it escapes */
function safePath(p: string): string {
  const abs = isAbsolute(p) ? p : join(root, p);
  const rel = relative(root, abs);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`Path escapes workspace (only ${root} is allowed): ${p}`);
  }
  return normalize(abs);
}
```

Why "policy as a plugin"? Because the guard lives **on the tool boundary** — no matter how the model constructs the path (`../etc/passwd`, absolute paths, symlinks), it cannot pass `safePath`. There is no side channel that "uses different wording". The official calls this "enforce the decision in the operation that makes it".

## 4. skills: Markdown Skill Packs -> Tools

Skills are `skills/*.md` files (frontmatter + body):

```markdown
---
name: calculator
description: Compute math expressions with Node.js — arithmetic, percentages, unit conversion
---

# Calculator Skill

1. Convert the user's expression into a safe JavaScript expression...
2. Run node -e "console.log(<expression>)" and read the output
...
```

The plugin turns them into two tools: `list_skills` (what skills exist) and `use_skill(name, task)` (load and execute):

<<< ../../mini-dsh/plugins/skills.ts

```ts
tools.register(tool(
  "use_skill",
  "Load a skill's full instructions by name and start executing it. Returns the skill body; follow it to complete the task.",
  { type: "object", properties: { name: {...}, task: {...} }, required: ["name", "task"] },
  ({ name, task }) => {
    const skill = loadAll().find((s) => s.name === name);
    if (!skill) throw new Error(`Unknown skill: ${name}`);
    return `# Skill: ${skill.name}\n${skill.body}\n\n# Current task\n${task}`;
  },
));
```

The elegance: **the skill body enters the context through the ordinary `tool/result` channel** — no change to the agent loop whatsoever. Skills are naturally auditable (every use is in the log), composable, and hot-reloadable (edit the md, it takes effect). The model's call sequence looks like:

```text
assistant: let me see what skills exist -> tool:list_skills
assistant: the user wants a calculation, load the calculator skill -> tool:use_skill(name=calculator)
assistant: follow the skill steps -> tool:run_bash(node -e ...)
assistant: give the final answer
```

## Assembly: boot.ts (the official profile idea, simplified)

A running official `dsh` is a "plugin tree composed from layers", with profiles declaring which bundles to mount. mini-dsh simplifies this into one `boot.ts`:

<<< ../../mini-dsh/boot.ts

```ts
export async function buildContext(opts: BootOptions = {}): Promise<Context> {
  const ctx = new Context();
  // ---- service layer: plugins depend on these ----
  ctx.service("tools", new ToolRegistry(ctx));
  ctx.service("sessions", new Sessions());
  ctx.service("llm", /* DeepSeek or Scripted */);
  // ---- plugin layer: compose capabilities on demand ----
  ctx.plugin(systemPromptPlugin);
  ctx.plugin(shellPlugin);
  ctx.plugin(fsPlugin({ root: opts.fsRoot }));
  ctx.plugin(skillsPlugin({ dir: opts.skillsDir }));
  await ctx.start();
  return ctx;
}
```

"Want it to write files? Mount `fsPlugin`. Want it to run commands? Mount `shellPlugin`." — capabilities plug in and out; that's "Everything is a Plugin" in daily form. The `provider: "scripted"` option lets the whole assembly run without a key (tests, CI, and demos all rely on it).

::: tip Recap
- Four registration patterns: service contribution (prompt), capability as tool (shell), policy as plugin (path sandbox), content as tool (skills)
- Skills inject context through the `tool/result` channel — zero core changes
- boot.ts is the profile idea simplified: services as the base, plugins composed on demand

Next: [CLI & Startup →](09-cli)
:::
