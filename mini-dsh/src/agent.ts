/**
 * Agent 循环:一个 turn = 若干 step;一个 step = 一次模型请求 + 它调用的工具。
 *
 * 官方 turn flow(简化):
 *   turn/start -> user/message -> step/start -> agent/request(waterfall)
 *     -> llm/stream -> assistant/chunk* -> assistant/message
 *     -> tool/call* -> tools 管线 -> tool/result* -> step/end
 *   -> turn/end
 * 所有模型可见的输入都写入会话日志,deriveMessages() 据此投影上下文。
 */

import type { Context } from "./context.ts";
import type { LLMProvider } from "./llm.ts";
import { Session, type ChatMessage, type ToolCall } from "./session.ts";
import type { ToolRegistry } from "./tools.ts";

export interface AgentOptions {
  provider: LLMProvider;
  model?: string;
  maxSteps?: number;
}

export class Agent {
  readonly ctx: Context;
  readonly session: Session = new Session();
  readonly model: string | undefined;
  private provider: LLMProvider;
  private maxSteps: number;

  constructor(ctx: Context, opts: AgentOptions) {
    this.ctx = ctx;
    this.provider = opts.provider;
    this.model = opts.model;
    this.maxSteps = opts.maxSteps ?? 8;
  }

  /** 完整一轮:输入用户消息,返回最终 assistant 消息 */
  async turn(userInput: string): Promise<ChatMessage> {
    const ctx = this.ctx;
    const session = this.session;
    const tools = ctx.get<ToolRegistry>("tools");

    ctx.emit("turn/start", { agent: this, session });
    session.append("turn/start", { agent: this.session.id });
    session.append("user/message", { content: userInput });

    let assistant: ChatMessage = { role: "assistant", content: "" };

    for (let step = 0; step < this.maxSteps; step++) {
      ctx.emit("step/start", { step, session });
      session.append("step/start", { step });

      // 组装请求:system prompt(waterfall 可改写)+ 历史消息 + 工具 schema
      const systemPrompt = await ctx.waterfall("system-prompt", this.renderSystemPrompt());
      const messages = session.deriveMessages();
      if (systemPrompt) messages.unshift({ role: "system", content: systemPrompt });
      const request = await ctx.waterfall<{ messages: ChatMessage[]; tools: unknown[] }>(
        "agent/request",
        { messages, tools: tools?.schemas() ?? [] },
      );

      // 流式请求:chunk 事件实时发出,message 事件为准
      let content = "";
      let toolCalls: ToolCall[] = [];
      for await (const ev of this.provider.stream(request.messages, request.tools)) {
        if (ev.type === "chunk") {
          session.append("assistant/chunk", { delta: ev.delta });
          ctx.emit("assistant/chunk", { delta: ev.delta, session });
        } else {
          content = ev.message.content ?? "";
          toolCalls = ev.message.tool_calls ?? [];
        }
      }
      session.append("assistant/message", { content, tool_calls: toolCalls });

      if (toolCalls.length === 0) {
        assistant = { role: "assistant", content };
        ctx.emit("step/end", { step, tool_calls: 0, session });
        session.append("step/end", { step, tool_calls: 0 });
        break;
      }

      // 执行模型要求的每个工具调用,结果写回日志
      for (const tc of toolCalls) {
        ctx.emit("tool/call", { name: tc.function.name, args: tc.function.arguments, session });
        let resultText: string;
        try {
          const parsed = JSON.parse(tc.function.arguments || "{}") as Record<string, any>;
          const result = await tools!.execute(tc.function.name, parsed);
          resultText = typeof result === "string" ? result : JSON.stringify(result);
        } catch (err) {
          resultText = `<tool error: ${err instanceof Error ? err.message : String(err)}>`;
        }
        session.append("tool/result", { tool_call_id: tc.id, content: resultText });
      }
      ctx.emit("step/end", { step, tool_calls: toolCalls.length, session });
      session.append("step/end", { step, tool_calls: toolCalls.length });
    }

    ctx.emit("turn/end", { session });
    session.append("turn/end", {});
    return assistant;
  }

  /** system prompt 由插件通过 ctx.service('systemPrompt') 贡献片段 */
  private renderSystemPrompt(): string {
    const sp = this.ctx.get<SystemPrompt>("systemPrompt");
    return sp ? sp.render() : "";
  }
}

/** 提示词片段组装服务(对应官方 ctx.systemPrompt) */
export class SystemPrompt {
  private sections = new Map<string, string>();

  addSection(key: string, text: string): void {
    this.sections.set(key, text);
  }

  removeSection(key: string): void {
    this.sections.delete(key);
  }

  render(): string {
    return [...this.sections.entries()]
      .map(([key, text]) => `## ${key}\n${text}`)
      .join("\n\n");
  }
}
