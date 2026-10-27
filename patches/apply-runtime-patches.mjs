#!/usr/bin/env node
/**
 * apply-runtime-patches.mjs â€” Re-apply raffimh/9router `patched` fixes to the
 * npm-installed build (.next-cli-build) after every upstream update.
 *
 * Usage:  node patches/apply-runtime-patches.mjs [--verify-only]
 *
 * Design rules (lessons from v0.5.59 TDZ + v0.5.65 accessor incidents):
 *  1. IDEMPOTENT â€” every patch checks isApplied() first and skips if present.
 *  2. EXACT-MATCH OR LOUD FAILURE â€” patterns are validated against a known
 *     build (v0.5.69). If the minified shape changed upstream, the script
 *     FAILS that patch and tells you which checklist section to redo by hand.
 *     It NEVER silently half-patches.
 *  3. VERIFY GATE â€” after applying, runs node --check on every touched file
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
      c.content.includes("(q.response?.candidates||q.candidates)?.[0]?.content?.parts)for(let a of (q.response?.candidates||q.candidates)[0].content.parts)") &&
      c.content.includes("reasoning-only turn"),
    // pristine v0.5.69 upstream shape â†’ patched shape (condition AND body together;
    // patching only the condition caused `Cannot read properties of undefined (reading '0')`).
    // v0.5.69 var map: state=Bâ†’C, content=Dâ†’E, thinking=Eâ†’F, terminalSeen=Kâ†’L,
    //                  doneSent=Mâ†’N, emitted=Hâ†’I, finalize=Oâ†’P
    patterns: [
      {
        // v0.5.111: parsed chunk = q (was p in <= 0.5.104)
        from: 'q.candidates?.[0]?.content?.parts)for(let a of q.candidates[0].content.parts)',
        to: '(q.response?.candidates||q.candidates)?.[0]?.content?.parts)for(let a of (q.response?.candidates||q.candidates)[0].content.parts)',
        count: 1,
      },
      {
        from: 'let z=(0,d.Y8)(c,r,q,G);if(z?._openaiIntermediate)',
        to: 'let z=(0,d.Y8)(c,r,q,G),_gf=c===e.h.GEMINI||c===e.h.GEMINI_CLI||c===e.h.VERTEX||c===e.h.ANTIGRAVITY;if(z?._openaiIntermediate)',
        count: 1,
      },
      {
        // v0.5.111 var map: targetFormat=c, sourceFormat=r, content=I, thinking=J,
        // state=G, doneSent=R, terminalSeen=Q, emitted=M, logger=(0,m.s),
        // responses-fail=(0,l.u9), reqLogger=t, controller=f, encoder=n.
        // TDZ: loop body shadows `b` and `c` â€” guard uses r/_gf only.
        from: 'if(z?.length>0)for(let a of z){if(null==a||!(0,j.c2)(a,r))continue;',
        to: 'if(z?.length>0)for(let a of z){if(null==a||!(0,j.c2)(a,r))continue;if((r===e.h.OPENAI_RESPONSES||r===e.h.OPENAI)&&_gf&&!R&&(r===e.h.OPENAI_RESPONSES?(a?.event==="response.completed"||a?.type==="response.completed"||a?.data?.type==="response.completed"):!!a?.choices?.[0]?.finish_reason)&&0===I.length&&!(G?.geminiToolCallCount>0)&&J.length>0){(0,m.s)("SSE",`reasoning-only turn | format=${r} | thinking=${J.length} chars | replacing completion with retryable error`);if(r===e.h.OPENAI_RESPONSES){let a=(0,l.u9)();t?.appendConvertedChunk?.(a),f.enqueue(n.encode(a))}else{let a=\'data: {"error":{"message":"Reasoning-only turn completed without content; stream aborted for client retry","type":"stream_disconnected","code":"stream_disconnected"}}\\n\\n\';t?.appendConvertedChunk?.(a),f.enqueue(n.encode(a))}let b="data: [DONE]\\n\\n";t?.appendConvertedChunk?.(b),f.enqueue(n.encode(b)),Q=!0,R=!0,M++;continue}',
        count: 1,
      },
    ],
    markers: ["reasoning-only turn", '(q.response?.candidates||q.candidates)[0]'],
  },
  {
    id: "P2 stream: cancel() usage finalization hook",
    checklist: "2f (chunk step)",
    find: () => readChunk(CHUNKS, "Error in flush"),
    isApplied: (c) => c.content.includes('cancel(a){(0,m.s)("SSE"'),
    patterns: [
      {
        // v0.5.95 var map (function n): provider=p, model=t, finalizeStream=Q,
        // logger=(0,j.s) â€” j is a module import, not shadowed by n's params.
        from: 'console.log("Error in flush:",a),V()}}})}',
        to: 'console.log("Error in flush:",a),V()}},cancel(a){(0,m.s)("SSE",`cancel | provider=${s} | model=${w} | reason=${a?.message||a}`),V()}})}',
        count: 1,
      },
    ],
    markers: ['cancel(a){(0,j.s)("SSE"'],
  },
  {
    id: "P3 translator: view_image multimodal (responses->openai tool output)",
    checklist: "2i",
    loadName: "2380.js",
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
    loadName: "2380.js",
    isApplied: (c) => c.content.includes("_imgs.push({inlineData"),
    patterns: [
      {
        // v0.5.104 var map (chunk 8499.js, tool-result pairing loop after upstream
        // #4273/#4532 rewrite): loop destructures {origId:b,emitId:c,name:d},
        // queue vars e/f/g, resolved name h, pT result j, contents object j,
        // sanitize=n (renamed from m in v0.5.99).
        // Old (<=0.5.95): content=c, id=b, name=d, result=e, contents=g.
        from: 'let j=(0,i.pT)(e);null===j?j={result:e}:"object"!=typeof j&&(j={result:j}),a.push({functionResponse:{id:c,name:n(h),response:{result:j}}})}a.length>0&&j.contents.push({role:k.RV.USER,parts:a})',
        to: 'let _imgs=[];if(Array.isArray(e)){let _txts=[];for(let _p of e){let _u=_p?.image_url?.url??_p?.image_url??_p?.url;if("string"==typeof _u&&_u.startsWith("data:")){let _idx=_u.indexOf(",");_idx!==-1&&_imgs.push({inlineData:{mime_type:_u.substring(5,_idx).split(";")[0],data:_u.substring(_idx+1)}})}else if(_p?.type==="text"&&"string"==typeof _p.text){_txts.push(_p.text)}else if("string"==typeof _p){_txts.push(_p)}else{_txts.push(JSON.stringify(_p))}}e=_txts.join("\\n")}let j=(0,i.pT)(e);null===j?j={result:e}:"object"!=typeof j&&(j={result:j}),a.push({functionResponse:{id:c,name:n(h),response:{result:j}}}),a.push(..._imgs)}a.length>0&&j.contents.push({role:k.RV.USER,parts:a})',
        count: 1,
      },
    ],
    markers: ["_imgs.push({inlineData"],
  },
  {
    id: "P5 responses: embed usage in response.completed â€” SUPERSEDED upstream in v0.5.86 (commit da004655: state.responsesUsage)",
    checklist: "2e (native since v0.5.86)",
    skip: true,
    isApplied: () => true,
    patterns: [],
    markers: [],
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
    isApplied: (c) => c.content.includes('"dracula"===t') && c.content.includes('"dracula"===a().theme?"light"'),
    patterns: [
      {
        from: 'function s(e){let a=document.documentElement,i=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";"dark"===("system"===e?i:e)?a.classList.add("dark"):a.classList.remove("dark")}',
        to: 'function s(e){let a=document.documentElement,i=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";let t="system"===e?i:e;if("dracula"===t){a.classList.add("dark","dracula"),a.setAttribute("data-theme","dracula")}else{a.classList.remove("dracula"),a.removeAttribute("data-theme"),"dark"===t?a.classList.add("dark"):a.classList.remove("dark")}}',
        count: 1,
      },
      {
        from: 'toggleTheme:()=>{let i="dark"===a().theme?"light":"dark";e({theme:i}),s(i)}',
        to: 'toggleTheme:()=>{let i="dark"===a().theme?"dracula":"dracula"===a().theme?"light":"dark";e({theme:i}),s(i)}',
        count: 1,
      },
    ],
    markers: ['"dracula"===t'],
  },
  {
    id: "P8 auth: Qoder quota-112 connection disable",
    checklist: "2b (manual â†’ automated since v0.5.95)",
    find: () => readChunk(CHUNKS, "additional usage limit for your plan"),
    isApplied: (c) => c.content.includes("Qoder quota exhausted [403/code 112]"),
    patterns: [
      {
        // Insert AFTER the generic classifier's `!l` early-return, BEFORE `let s=`:
        // a 403 always yields shouldFallback:true from the classifier (403 is
        // excluded from the no-fallback 4xx class), so overriding here is
        // behaviorally identical to the source-level pre-classification check in
        // src/sse/services/auth.js (isQoderQuotaExhausted).
        // v0.5.95 var map (async fn m in chunk 4572): a=connectionId, b=status,
        // c=errorText, e=provider, p=connection, d.updateProviderConnection,
        // h.rs=resolveProviderId, j.warn=AUTH logger.
        from: '!l)return{shouldFallback:!1,cooldownMs:0};',
        to: '!l)return{shouldFallback:!1,cooldownMs:0};if("qoder"===(0,h.rs)(e)&&403===Number(b)&&/"code"\\s*:\\s*"112"/.test(String(c||""))){let _q="string"==typeof c?c.slice(0,200):"Qoder quota exhausted (code 112)";await (0,d.updateProviderConnection)(a,{isActive:!1,testStatus:"unavailable",lastError:_q,errorCode:403,lastErrorAt:new Date().toISOString(),backoffLevel:0}),j.warn("AUTH",`${p?.displayName||p?.name||p?.email||a.slice(0,8)} disabled: Qoder quota exhausted [403/code 112]`);return{shouldFallback:!0,cooldownMs:0}}',
        count: 1,
      },
    ],
    markers: ["Qoder quota exhausted [403/code 112]", '"qoder"===(0,h.rs)(e)'],
  },
  {
    id: "P9 capabilities: river deepseek-v4.1-flash vision:false (base64-as-text billing)",
    checklist: "2k (new - P11 source parity)",
    allChunks: true,
    findMarker: '{pattern:"*deepseek-v4.*",caps:{vision:!0',
    isApplied: (c) => c.content.includes('{pattern:"*deepseek-ai/deepseek-v4.1-flash*",caps:{vision:!1'),
    patterns: [
      {
        // riverai bills embedded base64 images as TEXT (~500k tokens per
        // screenshot). The river id "deepseek-ai/DeepSeek-V4.1-Flash-1017"
        // slips past the exact vision entries (prefix+suffix drift) and lands
        // on *deepseek-v4.* (vision:true) - force vision:false so
        // stripUnsupportedModalities + Vision Adapter engage. Scoped to the
        // "deepseek-ai/" prefixed id family; other providers unaffected.
        // Inserted BEFORE *deepseek-v4.* (first match wins).
        from: '{pattern:"*deepseek-v4.*",caps:{vision:!0,reasoning:!0,thinkingFormat:"deepseek",thinkingEffortSupported:!0,contextWindow:1e6,maxOutput:128e3}}',
        to: '{pattern:"*deepseek-ai/deepseek-v4.1-flash*",caps:{vision:!1,reasoning:!0,thinkingFormat:"deepseek",contextWindow:128e3,maxOutput:64e3}},{pattern:"*deepseek-v4.*",caps:{vision:!0,reasoning:!0,thinkingFormat:"deepseek",thinkingEffortSupported:!0,contextWindow:1e6,maxOutput:128e3}}',
        count: 1,
      },
    ],
    markers: ['{pattern:"*deepseek-ai/deepseek-v4.1-flash*",caps:{vision:!1'],
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
    if (patch.skip) {
      results.push({ id: patch.id, status: "SKIP", note: "superseded â€” no longer required" });
      continue;
    }
    // allChunks: apply the same pattern set to EVERY chunk containing findMarker
    // (capabilities tables are duplicated across several webpack chunks).
    if (patch.allChunks) {
      const jsChunks = fs.readdirSync(CHUNKS)
        .filter((f) => f.endsWith(".js"))
        .map((f) => ({ file: path.join(CHUNKS, f), name: f, content: fs.readFileSync(path.join(CHUNKS, f), "utf8") }))
        .filter((x) => x.content.includes(patch.findMarker));
      if (!jsChunks.length) {
        results.push({ id: patch.id, status: "SKIP", note: "no chunk contains findMarker" });
        continue;
      }
      for (const chunk of jsChunks) {
        if (patch.isApplied(chunk)) {
          results.push({ id: `${patch.id} [${chunk.name}]`, status: "ALREADY", note: "" });
          continue;
        }
        if (verifyOnly) {
          results.push({ id: `${patch.id} [${chunk.name}]`, status: "FAIL", note: "not applied (verify-only)" });
          continue;
        }
        let ok = true;
        for (const pat of patch.patterns) {
          const count = chunk.content.split(pat.from).length - 1;
          if (count !== pat.count) {
            results.push({ id: `${patch.id} [${chunk.name}]`, status: "FAIL", note: `pattern mismatch (found ${count}, expected ${pat.count}) - see checklist ${patch.checklist}` });
            ok = false;
            break;
          }
        }
        if (!ok) continue;
        for (const pat of patch.patterns) chunk.content = chunk.content.replace(pat.from, pat.to);
        save(chunk);
        const missing = patch.markers.filter((m) => !chunk.content.includes(m));
        if (missing.length) {
          results.push({ id: `${patch.id} [${chunk.name}]`, status: "FAIL", note: `markers missing after apply: ${missing.join(", ")}` });
          continue;
        }
        results.push({ id: `${patch.id} [${chunk.name}]`, status: "APPLIED", note: chunk.name });
      }
      continue;
    }
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
        results.push({ id: patch.id, status: "FAIL", note: `pattern mismatch (found ${count}, expected ${pat.count}) â€” manual re-patch required, see checklist ${patch.checklist}` });
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
for (const r of results) console.log(`[${r.status.padEnd(7)}] ${r.id}${r.note ? " â€” " + r.note : ""}`);
const failed = results.some((r) => r.status === "FAIL");
console.log(failed || !syntaxOk ? "\nRESULT: FAIL â€” do not use the build before fixing the FAILED patches." : "\nRESULT: OK â€” restart 9router, then hard-refresh browser (Ctrl+Shift+R) if CSS/theme chunks were patched.");
process.exit(failed || !syntaxOk ? 1 : 0);
