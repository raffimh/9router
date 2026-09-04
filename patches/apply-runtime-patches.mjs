#!/usr/bin/env node
/**
 * apply-runtime-patches.mjs — Re-apply raffimh/9router `patched` fixes to the
 * npm-installed build (.next-cli-build) after every upstream update.
 *
 * Usage:  node patches/apply-runtime-patches.mjs [--verify-only]
 *
 * Design rules (lessons from v0.5.59 TDZ + v0.5.65 accessor incidents):
 *  1. IDEMPOTENT — every patch checks isApplied() first and skips if present.
 *  2. EXACT-MATCH OR LOUD FAILURE — patterns are validated against a known
 *     build (v0.5.65). If the minified shape changed upstream, the script
 *     FAILS that patch and tells you which checklist section to redo by hand.
 *     It NEVER silently half-patches.
 *  3. VERIFY GATE — after applying, runs node --check on every touched file
 *     and asserts every marker string is present.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LOCALAPPDATA = process.env.LOCALAPPDATA || "C:/Users/raffi/AppData/Local";
const BASE = path.join(LOCALAPPDATA, "nvm/v24.13.1/node_modules/9router/app/.next-cli-build");
const CHUNKS = path.join(BASE, "server/chunks");
const CSS_DIR = path.join(BASE, "static/css");
const ST_CHUNKS = path.join(BASE, "static/chunks");

const verifyOnly = process.argv.includes("--verify-only");
const results = [];
const touched = new Set();

function readChunk(dir, marker) {
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".js")) continue;
    const p = path.join(dir, f);
    const content = fs.readFileSync(p, "utf8");
    if (content.includes(marker)) return { file: p, name: f, content };
  }
  return null;
}

function loadChunk(dir, name) {
  const p = path.join(dir, name);
  return { file: p, name, content: fs.readFileSync(p, "utf8") };
}

function save(chunk) {
  fs.writeFileSync(chunk.file, chunk.content, "utf8");
  touched.add(chunk.file);
}

// ---------------------------------------------------------------------------
// Patch definitions
// ---------------------------------------------------------------------------
const patches = [
  {
    id: "P1 stream: reasoning-only guard + antigravity envelope unwrap",
    checklist: "2g",
    find: () => readChunk(CHUNKS, "Error in flush"),
    isApplied: (c) =>
      c.content.includes("(p.response?.candidates||p.candidates)?.[0]?.content?.parts)for(let a of (p.response?.candidates||p.candidates)[0].content.parts)") &&
      c.content.includes("reasoning-only turn"),
    // pristine v0.5.65 upstream shape → patched shape (condition AND body together;
    // patching only the condition caused `Cannot read properties of undefined (reading '0')`)
    patterns: [
      {
        from: 'p.candidates?.[0]?.content?.parts)for(let a of p.candidates[0].content.parts)',
        to: '(p.response?.candidates||p.candidates)?.[0]?.content?.parts)for(let a of (p.response?.candidates||p.candidates)[0].content.parts)',
        count: 1,
      },
      {
        from: 'let w=(0,d.Y8)(c,o,p,B);if(w?._openaiIntermediate)',
        to: 'let w=(0,d.Y8)(c,o,p,B),_gf=c===e.h.GEMINI||c===e.h.GEMINI_CLI||c===e.h.VERTEX||c===e.h.ANTIGRAVITY;if(w?._openaiIntermediate)',
        count: 1,
      },
      {
        from: 'if(w?.length>0)for(let a of w){if(null==a||!(0,h.c2)(a,o))continue;',
        to: 'if(w?.length>0)for(let a of w){if(null==a||!(0,h.c2)(a,o))continue;if((o===e.h.OPENAI_RESPONSES||o===e.h.OPENAI)&&_gf&&!M&&(o===e.h.OPENAI_RESPONSES?(a?.event==="response.completed"||a?.type==="response.completed"||a?.data?.type==="response.completed"):!!a?.choices?.[0]?.finish_reason)&&0===D.length&&!(B?.geminiToolCallCount>0)&&E.length>0){(0,j.s)("SSE",`reasoning-only turn | format=${o} | thinking=${E.length} chars | replacing completion with retryable error`);if(o===e.h.OPENAI_RESPONSES){let a=(0,i.u9)();q?.appendConvertedChunk?.(a),f.enqueue(k.encode(a))}else{let a=\'data: {"error":{"message":"Reasoning-only turn completed without content; stream aborted for client retry","type":"stream_disconnected","code":"stream_disconnected"}}\\n\\n\';q?.appendConvertedChunk?.(a),f.enqueue(k.encode(a))}let b="data: [DONE]\\n\\n";q?.appendConvertedChunk?.(b),f.enqueue(k.encode(b)),K=!0,M=!0,H++;continue}',
        count: 1,
      },
    ],
    markers: ["reasoning-only turn", '(p.response?.candidates||p.candidates)[0]'],
  },
  {
    id: "P2 stream: cancel() usage finalization hook",
    checklist: "2f (chunk step)",
    find: () => readChunk(CHUNKS, "Error in flush"),
    isApplied: (c) => c.content.includes('cancel(a){(0,j.s)("SSE"'),
    patterns: [
      {
        from: 'console.log("Error in flush:",a),O()}}}',
        to: 'console.log("Error in flush:",a),O()},cancel(a){(0,j.s)("SSE",`cancel | provider=${p} | model=${t} | reason=${a?.message||a}`),O()}}}',
        count: 1,
      },
    ],
    markers: ['cancel(a){(0,j.s)("SSE"'],
  },
  {
    id: "P3 translator: view_image multimodal (responses->openai tool output)",
    checklist: "2i",
    loadName: "8499.js",
    isApplied: (c) => c.content.includes('a.output.some(p=>p?.type==="input_image"'),
    patterns: [
      {
        from: 'e.messages.push({role:g.z7.TOOL,tool_call_id:a.call_id,content:"string"==typeof a.output?a.output:JSON.stringify(a.output)})',
        to: 'if(Array.isArray(a.output)&&a.output.some(p=>p?.type==="input_image"||p?.type==="output_image"||p?.type==="image_url")){let m=[];for(let p of a.output){let u=p?.image_url??p?.url;if((p?.type==="input_image"||p?.type==="output_image"||p?.type==="image_url")&&typeof u==="string"&&u){m.push({type:g.x4.IMAGE_URL,image_url:{url:u,detail:"auto"}})}else if(p?.type==="output_text"||p?.type==="input_text"||p?.type==="text"){m.push({type:g.x4.TEXT,text:p.text??""})}else if(typeof p==="string"){m.push({type:g.x4.TEXT,text:p})}else{m.push({type:g.x4.TEXT,text:JSON.stringify(p)})}}e.messages.push({role:g.z7.TOOL,tool_call_id:a.call_id,content:m})}else e.messages.push({role:g.z7.TOOL,tool_call_id:a.call_id,content:"string"==typeof a.output?a.output:JSON.stringify(a.output)})',
        count: 1,
      },
    ],
    markers: ['a.output.some(p=>p?.type==="input_image"'],
  },
  {
    id: "P4 translator: view_image inlineData (openai->gemini tool result)",
    checklist: "2i",
    loadName: "8499.js",
    isApplied: (c) => c.content.includes("_imgs.push({inlineData"),
    patterns: [
      {
        from: 'let d=i[c],e=(0,h.pT)(d);null===e?e={result:d}:"object"!=typeof e&&(e={result:e}),a.push({functionResponse:{id:c,name:l(b),response:{result:e}}})}a.length>0&&e.contents.push({role:j.RV.USER,parts:a})',
        to: 'let d=i[c],_imgs=[];if(Array.isArray(d)){let _txts=[];for(let _p of d){let _u=_p?.image_url?.url??_p?.image_url??_p?.url;if("string"==typeof _u&&_u.startsWith("data:")){let _idx=_u.indexOf(",");_idx!==-1&&_imgs.push({inlineData:{mime_type:_u.substring(5,_idx).split(";")[0],data:_u.substring(_idx+1)}})}else if(_p?.type==="text"&&"string"==typeof _p.text){_txts.push(_p.text)}else if("string"==typeof _p){_txts.push(_p)}else{_txts.push(JSON.stringify(_p))}}d=_txts.join("\\n")}let e=(0,h.pT)(d);null===e?e={result:d}:"object"!=typeof e&&(e={result:e}),a.push({functionResponse:{id:c,name:l(b),response:{result:e}}}),a.push(..._imgs)}a.length>0&&e.contents.push({role:j.RV.USER,parts:a})',
        count: 1,
      },
    ],
    markers: ["_imgs.push({inlineData"],
  },
  {
    id: "P5 responses: embed usage in response.completed (auto-compact trigger)",
    checklist: "2e (chunk step)",
    loadName: "8499.js",
    isApplied: (c) => c.content.includes("usage:h}})}else b(") && c.content.includes("total_tokens:c.total_tokens??(d+e)"),
    patterns: [
      {
        from: 'a.completedSent=!0,b("response.completed",{type:"response.completed",response:{id:a.responseId,object:"response",created_at:a.created,status:"completed",background:!1,error:null}})',
        to: 'a.completedSent=!0,function(c){let d=c?(c.prompt_tokens??c.input_tokens??0):0,e=c?(c.completion_tokens??c.output_tokens??0):0;if(d||e){let f=c.cached_tokens??c.prompt_tokens_details?.cached_tokens??0,g=c.reasoning_tokens??c.completion_tokens_details?.reasoning_tokens??0,h={input_tokens:d,input_tokens_details:{cached_tokens:f},output_tokens:e,output_tokens_details:{reasoning_tokens:g},total_tokens:c.total_tokens??(d+e)};b("response.completed",{type:"response.completed",response:{id:a.responseId,object:"response",created_at:a.created,status:"completed",background:!1,error:null,usage:h}})}else b("response.completed",{type:"response.completed",response:{id:a.responseId,object:"response",created_at:a.created,status:"completed",background:!1,error:null}})}(a.usage)',
        count: 1,
      },
    ],
    markers: ["total_tokens:c.total_tokens??(d+e)"],
  },
  {
    id: "P6 dracula theme: CSS variables",
    checklist: "2j (CSS)",
    css: true,
    isApplied: () => readAllIn(CSS_DIR).some((x) => x.content.includes("--color-bg:#1e1f29")),
    applyCss: true,
    markers: [],
  },
  {
    id: "P7 dracula theme: theme store chunk (apply + 3-state toggle)",
    checklist: "2j (store chunk)",
    find: () => readChunk(ST_CHUNKS, "toggleTheme"),
    isApplied: (c) => c.content.includes('"dracula"===t') && c.content.includes('"dracula"===i().theme?"light"'),
    patterns: [
      {
        from: 'function s(e){let i=document.documentElement,a=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";"dark"===("system"===e?a:e)?i.classList.add("dark"):i.classList.remove("dark")}',
        to: 'function s(e){let i=document.documentElement,a=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";let t="system"===e?a:e;if("dracula"===t){i.classList.add("dark","dracula"),i.setAttribute("data-theme","dracula")}else{i.classList.remove("dracula"),i.removeAttribute("data-theme"),"dark"===t?i.classList.add("dark"):i.classList.remove("dark")}}',
        count: 1,
      },
      {
        from: 'toggleTheme:()=>{let a="dark"===i().theme?"light":"dark";e({theme:a}),s(a)}',
        to: 'toggleTheme:()=>{let a="dark"===i().theme?"dracula":"dracula"===i().theme?"light":"dark";e({theme:a}),s(a)}',
        count: 1,
      },
    ],
    markers: ['"dracula"===t'],
  },
];

function readAllIn(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".css"))
    .map((f) => ({ file: path.join(dir, f), name: f, content: fs.readFileSync(path.join(dir, f), "utf8") }));
}

const DRACULA_CSS = `
.dark.dracula,[data-theme="dracula"]{--color-brand-50:#f7f3fe;--color-brand-100:#eee5fd;--color-brand-200:#d3bff6;--color-brand-300:#c8a8fa;--color-brand-400:#bd93f9;--color-brand-500:#bd93f9;--color-brand-600:#9b6fe8;--color-brand-700:#7b4fd6;--color-brand-800:#5c39ab;--color-brand-900:#3d2672;--color-primary:#bd93f9;--color-primary-hover:#a678ec;--color-bg:#1e1f29;--color-bg-alt:#22232f;--color-surface:#282a36;--color-surface-2:#343746;--color-surface-3:#44475a;--color-sidebar:#242634d9;--color-border:#44475a;--color-border-subtle:#3b3e4e;--color-text:#f8f8f2;--color-text-main:#f8f8f2;--color-text-muted:#b8bfe5;--color-text-subtle:#8b93b8;--color-danger:#ff5555;--color-success:#50fa7b;--color-warning:#f1fa8c;--color-info:#8be9fd;--shadow-soft:0 1px 2px 0 #0000004d;--shadow-warm:0 2px 12px -2px #bd93f940;--shadow-elevated:0 12px 28px -4px #00000073;--shadow-elev:inset 0 1px 0 0 #ffffff0f,0 1px 2px #0006,0 16px 48px -8px #0000008c;--shadow-focus:0 0 0 3px #bd93f92e;color-scheme:dark}
.dark.dracula .bg-white\\/5,.dark.dracula [class*="bg-white/5"],[data-theme="dracula"] .bg-white\\/5,[data-theme="dracula"] [class*="bg-white/5"]{background-color:#282a36!important}
.dark.dracula .border-white\\/10,.dark.dracula [class*="border-white/10"],[data-theme="dracula"] .border-white\\/10,[data-theme="dracula"] [class*="border-white/10"]{border-color:#44475a!important}
.dark.dracula .bg-white\\/10,.dark.dracula [class*="bg-white/10"],[data-theme="dracula"] .bg-white\\/10,[data-theme="dracula"] [class*="bg-white/10"]{background-color:#343746!important}
`;

function applyDraculaCss() {
  let applied = 0;
  for (const x of readAllIn(CSS_DIR)) {
    if (!x.content.includes(".dark.dracula")) {
      fs.writeFileSync(x.file, x.content + DRACULA_CSS, "utf8");
      touched.add(x.file);
      applied++;
    }
  }
  return applied;
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------
for (const patch of patches) {
  try {
    const chunk = patch.css ? null : (patch.loadName ? loadChunk(CHUNKS, patch.loadName) : patch.find());
    if (!chunk && !patch.css) {
      results.push({ id: patch.id, status: "SKIP", note: "target chunk not found (marker missing)" });
      continue;
    }
    if (patch.isApplied(chunk ?? { content: "" })) {
      results.push({ id: patch.id, status: "ALREADY", note: "" });
      continue;
    }
    if (verifyOnly) {
      results.push({ id: patch.id, status: "FAIL", note: "not applied (verify-only mode)" });
      continue;
    }
    if (patch.css) {
      const n = applyDraculaCss();
      results.push({ id: patch.id, status: n > 0 ? "APPLIED" : "ALREADY", note: `${n} css file(s)` });
      continue;
    }
    let ok = true;
    for (const pat of patch.patterns) {
      const count = chunk.content.split(pat.from).length - 1;
      if (count !== pat.count) {
        results.push({ id: patch.id, status: "FAIL", note: `pattern mismatch (found ${count}, expected ${pat.count}) — manual re-patch required, see checklist ${patch.checklist}` });
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    for (const pat of patch.patterns) chunk.content = chunk.content.replace(pat.from, pat.to);
    save(chunk);
    const missing = patch.markers.filter((m) => !chunk.content.includes(m));
    if (missing.length) {
      results.push({ id: patch.id, status: "FAIL", note: `markers missing after apply: ${missing.join(", ")}` });
      continue;
    }
    results.push({ id: patch.id, status: "APPLIED", note: chunk.name });
  } catch (err) {
    results.push({ id: patch.id, status: "FAIL", note: err.message });
  }
}

// ---------------------------------------------------------------------------
// Verification gate: node --check on every touched JS file
// ---------------------------------------------------------------------------
let syntaxOk = true;
for (const file of touched) {
  if (!file.endsWith(".js")) continue;
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    syntaxOk = false;
    results.push({ id: `SYNTAX ${path.basename(file)}`, status: "FAIL", note: String(err.stderr).slice(0, 200) });
  }
}

console.log("=== apply-runtime-patches ===");
for (const r of results) console.log(`[${r.status.padEnd(7)}] ${r.id}${r.note ? " — " + r.note : ""}`);
const failed = results.some((r) => r.status === "FAIL");
console.log(failed || !syntaxOk ? "\nRESULT: FAIL — do not use the build before fixing the FAILED patches." : "\nRESULT: OK — restart 9router, then hard-refresh browser (Ctrl+Shift+R) if CSS/theme chunks were patched.");
process.exit(failed || !syntaxOk ? 1 : 0);
