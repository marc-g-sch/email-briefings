#!/usr/bin/env node
import { connectorStatus, writeDigest } from "./lib/digest.js";

let nextId = 1;

const tools = [
  {
    name: "connector_status",
    description: "Return LinkedIn and WhatsApp connector status.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "generate_digest",
    description: "Generate a morning or evening non-email communication digest preview.",
    inputSchema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["morning", "evening"] }
      }
    }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function callTool(name, args = {}) {
  if (name === "connector_status") {
    return { content: [{ type: "text", text: JSON.stringify(await connectorStatus(), null, 2) }] };
  }
  if (name === "generate_digest") {
    const result = await writeDigest(args.mode || "morning");
    return { content: [{ type: "text", text: result.rendered }] };
  }
  throw new Error(`Unknown tool: ${name}`);
}

process.stdin.setEncoding("utf8");
let buffer = "";
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() || "";

  for (const line of lines.filter(Boolean)) {
    const request = JSON.parse(line);
    try {
      if (request.method === "initialize") {
        send({
          jsonrpc: "2.0",
          id: request.id || nextId++,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "communication-briefing-connector", version: "0.1.0" }
          }
        });
      } else if (request.method === "tools/list") {
        send({ jsonrpc: "2.0", id: request.id || nextId++, result: { tools } });
      } else if (request.method === "tools/call") {
        const result = await callTool(request.params.name, request.params.arguments);
        send({ jsonrpc: "2.0", id: request.id || nextId++, result });
      }
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: request.id || nextId++,
        error: { code: -32000, message: error.message }
      });
    }
  }
});

