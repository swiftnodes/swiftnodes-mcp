// Regenerates data/chains.json from the SwiftNodes web source of truth.
// Run: cd ~/swiftnodes/proxy && npx tsx ~/swiftnodes-mcp/scripts/generate-chains-data.mjs
import { chains, primaryAliasForChain } from "/Users/mrmikeo/swiftnodes/web/lib/chains.ts";
import fs from "node:fs";

const slim = chains.map((c) => ({
  slug: c.slug,
  name: c.name,
  chainId: c.chainId ?? null,
  isEvm: c.isEvm,
  category: c.category ?? null,
  blockTime: c.blockTime ?? null,
  nativeCurrency: c.nativeCurrency?.symbol ?? null,
  description: c.description,
  overview: c.overview ?? null,
  pageUrl: `https://swiftnodes.io/${primaryAliasForChain(c)}`,
}));

const out = {
  generatedAt: new Date().toISOString(),
  source: "https://swiftnodes.io (web/lib/chains.ts)",
  chains: slim,
};
fs.writeFileSync(new URL("../data/chains.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`wrote ${slim.length} chains`);
