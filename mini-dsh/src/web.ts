/**
 * web:最简 Web UI(node:http,零依赖)+ SSE 流式输出。
 * 对应官方 `dsh web`:浏览器里与 agent 对话,边生成边渲染。
 *
 * /api/chat 返回 text/event-stream:
 *   data: {"delta":"你"}       增量内容
 *   data: {"delta":"好"}       增量内容
 *   data: {"done":true,...}    回合结束(含最终全文)
 *   data: {"error":"..."}      出错
 */

import { createServer, type Server } from "node:http";
import type { Agent } from "./agent.ts";
import type { Context } from "./context.ts";
import { buildAgent, type BootOptions } from "../boot.ts";

const PAGE = `<!doctype html>
<html lang="zh">
<head><meta charset="utf-8"><title>mini-dsh</title>
<style>body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px}
#log{white-space:pre-wrap;border:1px solid #ddd;border-radius:8px;padding:16px;min-height:200px;max-height:60vh;overflow-y:auto}
input{width:70%;padding:8px}button{padding:8px 16px}.dim{color:#888}</style></head>
<body>
<h1>mini-dsh</h1><div id="log"><span class="dim">对话记录会显示在这里…</span></div>
<p><input id="msg" placeholder="输入任务,回车发送" autocomplete="off"><button onclick="send()">发送</button></p>
<script>
async function send(){
  const msg=document.getElementById('msg');
  if(!msg.value)return;
  const log=document.getElementById('log');
  if(log.firstChild.classList)log.firstChild.remove();
  log.textContent+='\\n你> '+msg.value+'\\nmini-dsh> ';
  msg.value=''; msg.disabled=true;
  try{
    const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({message:msg.value})});
    if(!r.ok||!r.body)throw new Error('HTTP '+r.status);
    // 流式读取 SSE:data: {"delta":"..."} / {"done":true} / {"error":"..."}
    const reader=r.body.getReader(); const dec=new TextDecoder(); let buf='';
    for(;;){
      const {done,value}=await reader.read(); if(done)break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\\n'); buf=lines.pop()??'';
      for(const line of lines){
        const t=line.trim(); if(!t.startsWith('data:'))continue;
        const ev=JSON.parse(t.slice(5).trim());
        if(ev.delta)log.textContent+=ev.delta;
        if(ev.error){log.textContent+='\\n[错误] '+ev.error+'\\n';break;}
        if(ev.done)log.textContent+='\\n';
        log.scrollTop=log.scrollHeight;
      }
    }
  }catch(e){
    log.textContent+='\\n[请求失败] '+e.message+'\\n';
  }finally{ msg.disabled=false; }
  log.scrollTop=log.scrollHeight;
}
msg.addEventListener('keydown',e=>{if(e.key==='Enter')send();});
</script></body></html>`;

/** 独立可测:给定已组装好的 ctx + agent,返回 HTTP 服务器 */
export function createChatServer(ctx: Context, agent: Agent): Server {
  return createServer(async (req, res) => {
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(PAGE);
      return;
    }
    if (req.url === "/api/chat" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { message } = JSON.parse(body);

      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.flushHeaders();

      // 订阅流式增量,实时推送(与 CLI 打字机同款事件)
      const off = ctx.on("assistant/chunk")(({ delta }: any) => {
        if (typeof delta.content === "string") {
          res.write(`data: ${JSON.stringify({ delta: delta.content })}\n\n`);
        }
        if (delta.reasoning_content) {
          res.write(`data: ${JSON.stringify({ reasoning: delta.reasoning_content })}\n\n`);
        }
      });
      try {
        const reply = await agent.turn(String(message ?? ""));
        res.write(`data: ${JSON.stringify({ done: true, content: reply.content })}\n\n`);
      } catch (err) {
        res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
      } finally {
        off();
        res.end();
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
}

export async function web(port = 3080, opts: BootOptions = {}): Promise<void> {
  const { ctx, agent } = await buildAgent(opts);
  createChatServer(ctx, agent).listen(port, () => {
    console.log(`mini-dsh web: http://127.0.0.1:${port}`);
  });
  const shutdown = async () => {
    await ctx.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
