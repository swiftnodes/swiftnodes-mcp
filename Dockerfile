FROM node:18-alpine

# Zero-dependency stdio MCP server. Run interactively (stdio transport):
#   docker build -t swiftnodes-mcp .
#   docker run -i --rm swiftnodes-mcp
WORKDIR /app
COPY package.json ./
COPY bin/ ./bin/
COPY data/ ./data/

CMD ["node", "bin/server.js"]
