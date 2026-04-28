import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { dataDir, ensureDir } from "./paths.js";
import { normalizeMessage } from "./model.js";

const exportPatterns = [
  /^\[(\d{1,2}[./]\d{1,2}[./]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\]\s([^:]+):\s([\s\S]*)$/,
  /^(\d{1,2}[./]\d{1,2}[./]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+-\s([^:]+):\s([\s\S]*)$/
];

function parseExportDate(datePart, timePart) {
  const pieces = datePart.split(/[./]/).map(Number);
  const [day, month, rawYear] = pieces;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const [hour, minute, second = 0] = timePart.split(":").map(Number);
  return new Date(year, month - 1, day, hour, minute, second).toISOString();
}

function parseWhatsAppExport(text, chatName) {
  const messages = [];
  let current = null;

  for (const line of text.split(/\r?\n/)) {
    const match = exportPatterns.map((pattern) => line.match(pattern)).find(Boolean);
    if (match) {
      if (current) messages.push(normalizeMessage(current));
      current = {
        source: "whatsapp",
        chat: chatName,
        sender: match[3].trim(),
        text: match[4].trim(),
        date: parseExportDate(match[1], match[2])
      };
    } else if (current && line.trim()) {
      current.text += `\n${line}`;
    }
  }

  if (current) messages.push(normalizeMessage(current));
  return messages;
}

export async function whatsappStatus() {
  const chatsDir = join(dataDir(), "whatsapp", "chats");
  const webhookFile = join(dataDir(), "whatsapp", "webhook-events.jsonl");
  const hasExports = existsSync(chatsDir) && readdirSync(chatsDir).some((file) => file.endsWith(".txt"));
  const hasWebhookEvents = existsSync(webhookFile);
  if (hasExports || hasWebhookEvents) {
    return {
      name: "whatsapp",
      connected: true,
      mode: hasWebhookEvents ? "business-webhook" : "export",
      detail: hasWebhookEvents ? "WhatsApp webhook event file found." : "WhatsApp chat exports found."
    };
  }
  return {
    name: "whatsapp",
    connected: false,
    mode: "not-configured",
    detail: "Add data/whatsapp/chats/*.txt or run the Business Cloud webhook receiver."
  };
}

export async function readWhatsAppMessages() {
  const messages = [];
  const chatsDir = join(dataDir(), "whatsapp", "chats");
  if (existsSync(chatsDir)) {
    for (const file of readdirSync(chatsDir).filter((entry) => entry.endsWith(".txt"))) {
      messages.push(...parseWhatsAppExport(readFileSync(join(chatsDir, file), "utf8"), file.replace(/\.txt$/, "")));
    }
  }

  const webhookFile = join(dataDir(), "whatsapp", "webhook-events.jsonl");
  if (existsSync(webhookFile)) {
    const lines = readFileSync(webhookFile, "utf8").split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const event = JSON.parse(line);
      const entries = event.entry || [];
      for (const entry of entries) {
        for (const change of entry.changes || []) {
          for (const message of change.value?.messages || []) {
            messages.push(normalizeMessage({
              source: "whatsapp",
              id: message.id,
              sender: message.from,
              text: message.text?.body || message.button?.text || message.interactive?.body?.text || "",
              date: message.timestamp ? Number(message.timestamp) * 1000 : Date.now(),
              raw: message
            }));
          }
        }
      }
    }
  }

  return messages;
}

export function startWhatsAppWebhook() {
  const port = Number(process.env.WHATSAPP_WEBHOOK_PORT || 8787);
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "change-me";
  const outputDir = ensureDir(join(dataDir(), "whatsapp"));
  const outputFile = join(outputDir, "webhook-events.jsonl");

  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);
    if (request.method === "GET" && url.pathname === "/webhooks/whatsapp") {
      const mode = url.searchParams.get("hub.mode");
      const token = url.searchParams.get("hub.verify_token");
      const challenge = url.searchParams.get("hub.challenge");
      if (mode === "subscribe" && token === verifyToken && challenge) {
        response.writeHead(200, { "content-type": "text/plain" });
        response.end(challenge);
        return;
      }
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    if (request.method === "POST" && url.pathname === "/webhooks/whatsapp") {
      let body = "";
      request.on("data", (chunk) => { body += chunk; });
      request.on("end", () => {
        appendFileSync(outputFile, `${body}\n`);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  });

  server.listen(port, () => {
    console.log(`WhatsApp webhook listening on http://localhost:${port}/webhooks/whatsapp`);
  });
}

