# swiftnodes-mcp

An [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server for [SwiftNodes](https://swiftnodes.io) — multi-chain blockchain RPC, exposed to AI agents.

One API key, 75+ chains, flat-rate pricing. This server gives Claude, ChatGPT, Cursor, and any MCP client live, factual answers about chains, pricing, and JSON-RPC method support — plus the ability to probe any EVM endpoint directly.

## Tools

| Tool | What it does |
|---|---|
| `list_chains` | Every chain SwiftNodes serves — name, slug, chain ID, category, docs page. Filterable. |
| `get_chain` | Full detail for one chain: IDs, block time, native currency, HTTP/WebSocket/archive endpoint templates, docs links. |
| `get_pricing` | Live flat-rate plans from the public API — rate limits, included features, no compute units. |
| `get_method_support` | Which JSON-RPC methods work on which chain — auto-probed weekly through the same path customer requests take. Overview or per-method detail. |
| `probe_endpoint` | Diagnose any EVM JSON-RPC endpoint (ours or anyone's): chain identity, block height, archive capability, latency — or run a specific method call. |

## Install

Zero dependencies, Node >= 18.

**From this repo:**

```bash
git clone https://github.com/swiftnodes/swiftnodes-mcp
node swiftnodes-mcp/bin/server.js   # speaks MCP over stdio
```

**Via npm** (once published): `npx -y swiftnodes-mcp`

### Claude Desktop

```json
{
  "mcpServers": {
    "swiftnodes": {
      "command": "node",
      "args": ["/path/to/swiftnodes-mcp/bin/server.js"]
    }
  }
}
```

### Cursor / any MCP client

Add a stdio server with command `node` and args `["/path/to/swiftnodes-mcp/bin/server.js"]`.

## Data sources

- **Chains** — bundled snapshot generated from the SwiftNodes site source of truth (`scripts/generate-chains-data.mjs`; regenerate after chain changes).
- **Pricing** — fetched live from `https://rpc.swiftnodes.io/api/plans` (bundled fallback if unreachable).
- **Method support** — fetched live from `https://swiftnodes.io/method-matrix.json`, re-probed weekly. Support values reflect the real customer path, including failover.

## Notes

`probe_endpoint` will call any http(s) URL you give it — the same ground our CLI diagnostic [rpc-doctor](https://github.com/swiftnodes/rpc-doctor) covers. Probe responsibly: one quick pass per endpoint, not a load test.

Questions: [swiftnodes.io](https://swiftnodes.io) — free tier, no KYC.

## License

MIT — see [LICENSE](LICENSE).
