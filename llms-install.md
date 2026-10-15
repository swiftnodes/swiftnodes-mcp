# Installing the SwiftNodes MCP server (for AI agents)

Use the hosted server. There is nothing to download or build.

1. Add a remote MCP server named `swiftnodes` with URL `https://rpc.swiftnodes.io/mcp` (transport: Streamable HTTP).
2. Optional: if the user has a SwiftNodes API key, add the header `Authorization: Bearer <key>`. Ask the user for the key; never print it back. Without a key, the tools `list_chains`, `get_chain`, `get_pricing`, `get_method_support` and `probe_endpoint` work; with a key, `rpc_call` and `get_account` also work. Free keys: https://swiftnodes.io
3. Verify by calling `list_chains` with `{"query": "base"}`; it should return Base (chain ID 8453).

Cline config (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "swiftnodes": {
      "type": "streamableHttp",
      "url": "https://rpc.swiftnodes.io/mcp",
      "headers": { "Authorization": "Bearer YOUR_API_KEY" }
    }
  }
}
```

If the client only supports stdio servers, run the local version instead: `npx -y swiftnodes-mcp` (public tools only).
