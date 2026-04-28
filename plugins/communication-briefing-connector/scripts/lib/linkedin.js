import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { csvRecords } from "./csv.js";
import { dataDir } from "./paths.js";
import { normalizeMessage } from "./model.js";

function pick(record, names) {
  const key = names.find((name) => Object.prototype.hasOwnProperty.call(record, name));
  return key ? record[key] : "";
}

export async function linkedinStatus() {
  const jsonPath = join(dataDir(), "linkedin", "messages.json");
  const csvPath = join(dataDir(), "linkedin", "messages.csv");
  if (process.env.LINKEDIN_MESSAGES_ENDPOINT && process.env.LINKEDIN_ACCESS_TOKEN) {
    return { name: "linkedin", connected: true, mode: "approved-api", detail: "Approved API endpoint configured." };
  }
  if (existsSync(jsonPath) || existsSync(csvPath)) {
    return { name: "linkedin", connected: true, mode: "export", detail: "LinkedIn export file found." };
  }
  return {
    name: "linkedin",
    connected: false,
    mode: "not-configured",
    detail: "Add data/linkedin/messages.json, data/linkedin/messages.csv, or approved API credentials."
  };
}

export async function readLinkedInMessages() {
  if (process.env.LINKEDIN_MESSAGES_ENDPOINT && process.env.LINKEDIN_ACCESS_TOKEN) {
    const response = await fetch(process.env.LINKEDIN_MESSAGES_ENDPOINT, {
      headers: { Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}` }
    });
    if (!response.ok) throw new Error(`LinkedIn API request failed: ${response.status}`);
    const payload = await response.json();
    const messages = Array.isArray(payload) ? payload : payload.messages || [];
    return messages.map((message) => normalizeMessage({ ...message, source: "linkedin" }));
  }

  const jsonPath = join(dataDir(), "linkedin", "messages.json");
  if (existsSync(jsonPath)) {
    const payload = JSON.parse(readFileSync(jsonPath, "utf8"));
    const messages = Array.isArray(payload) ? payload : payload.messages || [];
    return messages.map((message) => normalizeMessage({ ...message, source: "linkedin" }));
  }

  const csvPath = join(dataDir(), "linkedin", "messages.csv");
  if (existsSync(csvPath)) {
    return csvRecords(readFileSync(csvPath, "utf8")).map((record) => normalizeMessage({
      source: "linkedin",
      id: pick(record, ["id", "Message ID", "message_id"]),
      conversationId: pick(record, ["conversationId", "Conversation ID", "conversation_id"]),
      sender: pick(record, ["sender", "From", "FROM"]),
      recipients: pick(record, ["recipients", "To", "TO"]).split(";").filter(Boolean),
      subject: pick(record, ["subject", "Subject", "Conversation title"]),
      text: pick(record, ["text", "Body", "Message", "Content"]),
      date: pick(record, ["date", "Date", "Sent At", "created_at"]),
      raw: record
    }));
  }

  return [];
}

