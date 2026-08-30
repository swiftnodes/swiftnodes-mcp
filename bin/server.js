#!/usr/bin/env node
// SwiftNodes MCP server — multi-chain RPC data and endpoint probing for AI agents.
// Zero dependencies; speaks MCP (JSON-RPC 2.0) over stdio. Node >= 18.
//
// Tools:
//   list_chains        — every chain SwiftNodes serves (filterable)
//   get_chain          — one chain: IDs, endpoints, docs links
//   get_pricing        — live flat-rate plans from the public API
//   get_method_support — weekly auto-probed JSON-RPC method matrix
//   probe_endpoint     — diagnose ANY EVM JSON-RPC endpoint (rpc-doctor-lite)

import fs from "node:fs";
import readline from "node:readline";

const VERSION = "0.1.0";
const API_BASE = "https://rpc.swiftnodes.io";
const SITE = "https://swiftnodes.io";
const KEY_HINT = "YOUR_API_KEY";

// ---------- static data ----------
const chainsData = JSON.parse(
  fs.readFileSync(new URL("../data/chains.json", import.meta.url), "utf8")
);
const CHAINS = chainsData.chains;

// Static fallback used only if the live API is unreachable.
const FALLBACK_PLANS = [
  { key: "free", name: "Free", priceUsd: 0, httpRps: 2, wsRps: 1, wsConnections: 2, monthlyRequests: 250000 },
  { key: "starter", name: "Starter", priceUsd: 49, httpRps: 50, wsRps: 25, wsConnections: 20 },
  { key: "growth", name: "Growth", priceUsd: 89, httpRps: 150, wsRps: 75, wsConnections: 50 },
  { key: "scale", name: "Scale", priceUsd: 149, httpRps: 300, wsRps: 150, wsConnections: 100 },
  { key: "pro", name: "Pro", priceUsd: 249, httpRps: 500, wsRps: 250, wsConnections: 200 },
];

function findChain(ref) {
  if (!ref) return null;
  const q = String(ref).trim().toLowerCase();
  return (
    CHAINS.find((c) => c.slug === q) ||
    CHAINS.find((c) => c.name.toLowerCase() === q) ||
    CHAINS.find((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q)) ||
    null
  );
}

function endpointsFor(slug) {
  return {
    http: `${API_BASE}/rpc/${slug}?key=${KEY_HINT}`,
    websocket: `${API_BASE}/ws/${slug}?key=${KEY_HINT}`,
    archive_http: `${API_BASE}/rpc/${slug}?key=${KEY_HINT}&archive=1`,
  };
}

async function fetchJson(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "user-agent": `swiftnodes-mcp/${VERSION}` },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

async function rpcCall(url, method, params, timeoutMs = 10000) {
  const started = Date.now();
  try {
    const j = await fetchJsonBody(url, { jsonrpc: "2.0", id: 1, method, params }, timeoutMs);
    const ms = Date.now() - started;
    if (j.error) return { ok: false, ms, error: j.error };
    return { ok: true, ms, result: j.result };
  } catch (e) {
    return { ok: false, ms: Date.now() - started, error: String(e?.message || e) };
  }
}

async function fetchJsonBody(url, body, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json", "user-agent": `swiftnodes-mcp/${VERSION}` },
      body: JSON.stringify(body),
    });
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch { /* non-JSON body */ }
    if (!r.ok) {
      const msg = j?.error?.message || j?.error || text.slice(0, 160) || `HTTP ${r.status}`;
      return { error: { code: -32000, message: `HTTP ${r.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}` } };
    }
    return j ?? { error: { code: -32700, message: "non-JSON response" } };
  } finally {
    clearTimeout(t);
  }
}

// ---------- tool implementations ----------

function toolListChains(args = {}) {
  const q = (args.query || "").toLowerCase();
  let list = CHAINS;
  if (args.evm_only === true) list = list.filter((c) => c.isEvm);
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q) || c.slug.includes(q));
  return {
    count: list.length,
    total: CHAINS.length,
    endpoint_format: `${API_BASE}/rpc/<slug>?key=<API_KEY> (WebSocket: ${API_BASE}/ws/<slug>?key=<API_KEY>)`,
    chains: list.map((c) => ({ name: c.name, slug: c.slug, chainId: c.chainId, category: c.category, page: c.pageUrl })),
  };
}

function toolGetChain(args = {}) {
  const c = findChain(args.chain);
  if (!c) {
    return { error: `Chain not found: ${args.chain}. Use list_chains to see all ${CHAINS.length} supported chains.` };
  }
  return {
    name: c.name,
    slug: c.slug,
    chainId: c.chainId,
    isEvm: c.isEvm,
    category: c.category,
    blockTime: c.blockTime,
    nativeCurrency: c.nativeCurrency,
    overview: c.overview || c.description,
    endpoints: endpointsFor(c.slug),
    notes: [
      "One API key works across every chain; free tier available, no KYC.",
      "Append &archive=1 to HTTP requests for archive routing (paid plans).",
      c.isEvm ? "EVM chain: standard eth_* JSON-RPC applies." : "Non-EVM chain: uses its native RPC dialect over the same endpoint format.",
    ],
    docs: {
      chain_page: c.pageUrl,
      method_support_matrix: `${SITE}/docs/method-support`,
      getting_started: `${SITE}/docs/getting-started`,
    },
  };
}

async function toolGetPricing() {
  let plans = null;
  let live = true;
  try {
    plans = await fetchJson(`${API_BASE}/api/plans`);
  } catch {
    plans = FALLBACK_PLANS;
    live = false;
  }
  const rows = Object.entries(plans).map(([key, p]) => ({
    plan: p.name || key,
    price_usd_per_month: p.priceUsd,
    http_rps: p.httpRps,
    ws_rps: p.wsRps ?? null,
    ws_connections: p.wsConnections ?? null,
    monthly_requests: p.monthlyRequests ?? "unlimited (rate-limited only)",
  }));
  return {
    source: live ? `${API_BASE}/api/plans (live)` : "bundled snapshot (live API unreachable)",
    model: "flat-rate monthly pricing — no per-request fees, no compute units; crypto or card; no KYC",
    extras: "All paid plans include archive access, enhanced APIs (sn_*), MEV-protected eth sends. Prepay discounts: 5% (6 mo), 10% (12 mo).",
    plans: rows,
  };
}

async function toolGetMethodSupport(args = {}) {
  let matrix;
  try {
    matrix = await fetchJson(`${SITE}/method-matrix.json`);
  } catch (e) {
    return { error: `Could not fetch the live matrix from ${SITE}/method-matrix.json (${String(e?.message || e)}). Try again later.` };
  }
  const probed = new Date(matrix.generatedAt).toISOString().slice(0, 10);
  if (args.method) {
    const m = String(args.method);
    if (!matrix.methods.includes(m)) {
      return { error: `Method '${m}' is not in the probed set. Probed methods: ${matrix.methods.join(", ")}` };
    }
    const per = matrix.chains
      .filter((c) => !c.unreachable)
      .map((c) => ({ chain: c.name, slug: c.slug, support: c.support[m] || "unknown" }));
    const yes = per.filter((x) => x.support === "yes").map((x) => x.slug);
    const partial = per.filter((x) => x.support === "partial").map((x) => x.slug);
    return {
      method: m,
      probed,
      summary: `${yes.length}/${per.length} chains serve ${m}${partial.length ? ` (+${partial.length} partial)` : ""}`,
      yes,
      partial,
      per_chain: per,
      docs: `${SITE}/docs/methods/${m}`,
      note: "Support values: yes = served through SwiftNodes; partial = served by some upstreams of that chain; no = unavailable. Re-probed weekly.",
    };
  }
  const overview = matrix.methods.map((m) => {
    const live = matrix.chains.filter((c) => !c.unreachable);
    const yes = live.filter((c) => c.support[m] === "yes").length;
    const partial = live.filter((c) => c.support[m] === "partial").length;
    return { method: m, served: `${yes}/${live.length}${partial ? ` (+${partial} partial)` : ""}` };
  });
  return {
    probed,
    chains_probed: matrix.chains.filter((c) => !c.unreachable).length,
    overview,
    docs: `${SITE}/docs/method-support`,
    note: "Weekly auto-probed through the same path customer requests take. Pass {method: <name>} for per-chain detail.",
  };
}

async function toolProbeEndpoint(args = {}) {
  const url = String(args.url || "").trim();
  if (!/^https?:\/\//.test(url)) return { error: "Provide an http(s) endpoint URL to probe." };

  if (args.method) {
    const r = await rpcCall(url, String(args.method), Array.isArray(args.params) ? args.params : []);
    return r.ok
      ? { url, method: args.method, latency_ms: r.ms, result: r.result }
      : { url, method: args.method, latency_ms: r.ms, error: r.error };
  }

  // No method given: quick health pass (chain identity, tip, archive depth).
  const cid = await rpcCall(url, "eth_chainId", []);
  if (!cid.ok) return { url, verdict: "unreachable or not EVM", detail: cid.error };
  const chainId = typeof cid.result === "string" ? parseInt(cid.result, 16) : cid.result;
  const tip = await rpcCall(url, "eth_blockNumber", []);
  const arch = await rpcCall(url, "eth_getBalance", ["0x0000000000000000000000000000000000000000", "0x1"]);
  const known = CHAINS.find((c) => c.chainId === chainId);
  return {
    url,
    chainId,
    chain: known ? `${known.name} (slug: ${known.slug})` : "not served by SwiftNodes",
    block_height: tip.ok ? tip.result : `error: ${JSON.stringify(tip.error)}`,
    archive_state_at_block_1: arch.ok ? "answered (archive-capable)" : `rejected (${JSON.stringify(arch.error).slice(0, 120)})`,
    latency_ms: { chainId: cid.ms, blockNumber: tip.ms, archiveProbe: arch.ms },
    verdict: "endpoint alive" + (arch.ok ? ", serves historical state" : ", historical state unavailable"),
  };
}

// ---------- MCP wiring ----------

const TOOLS = [
  {
    name: "list_chains",
    description:
      "List every blockchain SwiftNodes serves (75+ chains, one API key for all). Returns name, slug, chain ID, category, and docs page per chain. Use before get_chain if unsure of the exact chain name.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional name/slug substring filter, e.g. 'base' or 'zksync'." },
        evm_only: { type: "boolean", description: "If true, only EVM chains are returned." },
      },
    },
  },
  {
    name: "get_chain",
    description:
      "Full details for one chain SwiftNodes serves: chain ID, category, block time, native currency, HTTP/WebSocket/archive endpoint URL templates, and docs links.",
    inputSchema: {
      type: "object",
      properties: { chain: { type: "string", description: "Chain name or slug, e.g. 'Ethereum', 'base', 'zksync'." } },
      required: ["chain"],
    },
  },
  {
    name: "get_pricing",
    description:
      "Live flat-rate pricing for SwiftNodes RPC: monthly plans, HTTP/WS rate limits, included features. No per-request fees or compute units.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_method_support",
    description:
      "Which JSON-RPC methods work on which chain, auto-probed weekly through the real customer path (eth_getProof, trace_block, trace_filter, batching, archive, and more). Call with no args for the overview, or {method} for per-chain support.",
    inputSchema: {
      type: "object",
      properties: { method: { type: "string", description: "Optional method name, e.g. 'trace_filter' or 'eth_getProof'." } },
    },
  },
  {
    name: "probe_endpoint",
    description:
      "Diagnose ANY EVM JSON-RPC endpoint (ours or anyone's). With {url} only: checks chain identity, block height, and archive capability with latency. With {url, method, params}: performs that exact JSON-RPC call and returns the result or error.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The http(s) RPC endpoint URL to probe." },
        method: { type: "string", description: "Optional JSON-RPC method to call, e.g. 'eth_chainId'." },
        params: { type: "array", description: "Optional params array for the method call." },
      },
      required: ["url"],
    },
  },
];

async function handleToolCall(name, args) {
  switch (name) {
    case "list_chains": return toolListChains(args);
    case "get_chain": return toolGetChain(args);
    case "get_pricing": return await toolGetPricing();
    case "get_method_support": return await toolGetMethodSupport(args);
    case "probe_endpoint": return await toolProbeEndpoint(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function onMessage(msg) {
  const { id, method, params } = msg;
  try {
    switch (method) {
      case "initialize":
        send({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: params?.protocolVersion || "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "swiftnodes", version: VERSION },
            instructions:
              "SwiftNodes is a multi-chain blockchain RPC provider: one API key for 75+ chains, flat-rate pricing, HTTP + WebSocket. Use these tools for chain data, pricing, method-support facts, and live endpoint probing.",
          },
        });
        break;
      case "notifications/initialized":
      case "notifications/cancelled":
        break;
      case "ping":
        send({ jsonrpc: "2.0", id, result: {} });
        break;
      case "tools/list":
        send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
        break;
      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        try {
          const out = await handleToolCall(name, args);
          send({
            jsonrpc: "2.0", id,
            result: { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], isError: Boolean(out?.error) },
          });
        } catch (e) {
          send({
            jsonrpc: "2.0", id,
            result: { content: [{ type: "text", text: JSON.stringify({ error: String(e?.message || e) }) }], isError: true },
          });
        }
        break;
      }
      default:
        if (id !== undefined) {
          send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
        }
    }
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: String(e?.message || e) } });
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
let buf = "";
rl.on("line", (line) => {
  buf += line;
  try {
    const msg = JSON.parse(buf);
    buf = "";
    onMessage(msg);
  } catch {
    // incomplete JSON across lines: keep buffering (MCP stdio is newline-delimited,
    // but be tolerant of wrapped frames)
  }
});
rl.on("close", () => process.exit(0));
