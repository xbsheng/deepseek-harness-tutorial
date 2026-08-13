/**
 * 会话事件日志:append-only SessionEvent + 消息投影。
 *
 * 官方概念:会话日志是模型所见上下文的唯一来源,deriveMessages() 从日志
 * 投影出模型历史消息。规则:「模型可见的,必须已入日志。」
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface SessionEvent {
  type: string;
  seq: number;
  ts: number;
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

const MESSAGE_TYPES = new Set(["user/message", "assistant/message", "tool/result"]);

export class Session {
  id: string;
  events: SessionEvent[] = [];

  constructor(id: string = randomUUID().slice(0, 12)) {
    this.id = id;
  }

  /** 追加一条会话事件,自动带上序号与时间戳 */
  append(type: string, payload: Record<string, unknown> = {}): SessionEvent {
    const event: SessionEvent = { type, seq: this.events.length, ts: Date.now() / 1000, ...payload };
    this.events.push(event);
    return event;
  }

  /** 从日志投影模型可见的历史消息(官方 deriveMessages) */
  deriveMessages(): ChatMessage[] {
    const messages: ChatMessage[] = [];
    for (const ev of this.events) {
      if (!MESSAGE_TYPES.has(ev.type)) continue;
      if (ev.type === "user/message") {
        messages.push({ role: "user", content: ev.content as string });
      } else if (ev.type === "assistant/message") {
        const msg: ChatMessage = { role: "assistant", content: (ev.content as string) ?? "" };
        if (ev.tool_calls) msg.tool_calls = ev.tool_calls as ToolCall[];
        messages.push(msg);
      } else if (ev.type === "tool/result") {
        messages.push({
          role: "tool",
          tool_call_id: ev.tool_call_id as string,
          content: ev.content as string,
        });
      }
    }
    return messages;
  }

  // ---------- 持久化 ----------

  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const lines = [
      JSON.stringify({ type: "session/meta", id: this.id }),
      ...this.events.map((ev) => JSON.stringify(ev)),
    ];
    writeFileSync(path, lines.join("\n") + "\n", "utf8");
  }

  static load(path: string): Session {
    const session = new Session();
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const ev = JSON.parse(line);
      if (ev.type === "session/meta") {
        session.id = ev.id as string;
        continue;
      }
      session.events.push(ev);
    }
    return session;
  }
}

/** 会话注册表(对应官方 ctx.sessions):按 id 存取会话 */
export class Sessions {
  private map = new Map<string, Session>();

  create(): Session {
    const s = new Session();
    this.map.set(s.id, s);
    return s;
  }

  get(id: string): Session | undefined {
    return this.map.get(id);
  }

  all(): Session[] {
    return [...this.map.values()];
  }
}
