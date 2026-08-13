/**
 * system-prompt 插件:向 ctx.systemPrompt 服务贡献提示词片段。
 * 演示「注册是可逆效应」:卸载时移除自己贡献的片段。
 */

import type { PluginDef } from "../src/context.ts";
import { SystemPrompt } from "../src/agent.ts";

export const systemPromptPlugin: PluginDef = {
  name: "system-prompt",
  apply: (ctx) => {
    const sp = ctx.get<SystemPrompt>("systemPrompt") ?? ctx.service("systemPrompt", new SystemPrompt());
    sp.addSection("identity", "你是 mini-dsh,一个基于 DeepSeek 的智能体。先思考,再调用工具,最后给出简洁的回答。");
    return () => sp.removeSection("identity");
  },
};
