#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { connectorStatus, generateDigest, renderDigest } from "./lib/digest.js";
import { classifyMessage } from "./lib/classifier.js";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
const OAUTH = "https://oauth2.googleapis.com/token";
const OPENAI = "https://api.openai.com/v1/responses";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function base64UrlDecode(input = "") {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function base64UrlEncode(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function header(headers, name) {
  return headers.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value || "";
}

function localHour(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value);
}

function determineMode() {
  const requested = arg("--mode", process.env.DIGEST_MODE || "auto");
  if (requested === "morning" || requested === "evening") return requested;
  const hour = localHour(process.env.DIGEST_TIMEZONE || "Europe/Berlin");
  if (hour === 8) return "morning";
  if (hour === 20) return "evening";
  console.log(`Not a target local hour (${hour}). Exiting without sending.`);
  process.exit(0);
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${options.method || "GET"} ${url} failed: ${response.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

async function gmailAccessToken() {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    refresh_token: required("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });
  const token = await fetchJson(OAUTH, { method: "POST", body });
  return token.access_token;
}

function flattenParts(payload, out = []) {
  if (!payload) return out;
  out.push(payload);
  for (const part of payload.parts || []) flattenParts(part, out);
  return out;
}

async function readAttachment(token, messageId, part) {
  const filename = part.filename || "attachment";
  if (!part.body?.attachmentId) {
    return { filename, text: "", readable: false, note: "No attachment ID present." };
  }
  const attachment = await fetchJson(`${GMAIL}/messages/${messageId}/attachments/${part.body.attachmentId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const mime = part.mimeType || "";
  const bytes = Buffer.from(attachment.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  const textLike = mime.startsWith("text/") || [
    "application/json",
    "application/xml",
    "application/xhtml+xml",
    "text/calendar"
  ].includes(mime);
  return {
    filename,
    mime,
    readable: textLike,
    text: textLike ? bytes.toString("utf8").slice(0, 20000) : "",
    note: textLike ? "Read as text." : "Binary attachment found; include filename for review."
  };
}

async function readMessage(token, id) {
  const message = await fetchJson(`${GMAIL}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const headers = message.payload?.headers || [];
  const parts = flattenParts(message.payload);
  const bodies = parts
    .filter((part) => ["text/plain", "text/html"].includes(part.mimeType) && part.body?.data)
    .map((part) => base64UrlDecode(part.body.data).replace(/<[^>]+>/g, " "));
  const attachments = [];
  for (const part of parts.filter((item) => item.filename)) {
    attachments.push(await readAttachment(token, id, part));
  }
  const attachmentText = attachments
    .filter((item) => item.readable && item.text)
    .map((item) => `\n\nAttachment ${item.filename}:\n${item.text}`)
    .join("");

  return {
    id,
    source: "gmail",
    sender: header(headers, "From"),
    recipients: [header(headers, "To")].filter(Boolean),
    subject: header(headers, "Subject"),
    date: header(headers, "Date") ? new Date(header(headers, "Date")).toISOString() : new Date(Number(message.internalDate)).toISOString(),
    text: `${bodies.join("\n\n")}${attachmentText}`.trim(),
    attachments
  };
}

async function readGmail(token, mode) {
  const query = mode === "morning" ? "newer_than:1d" : "newer_than:1d";
  const list = await fetchJson(`${GMAIL}/messages?maxResults=30&q=${encodeURIComponent(query)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const ids = (list.messages || []).map((message) => message.id);
  const messages = [];
  for (const id of ids) messages.push(await readMessage(token, id));
  return messages;
}

function deterministicGmailDigest(messages) {
  const categories = {
    critical: [],
    important: [],
    needsReply: [],
    calendar: [],
    fyi: []
  };

  for (const message of messages) {
    const result = classifyMessage(message);
    const line = `- ${message.sender} - ${message.subject || "(no subject)"}`;
    if (result.critical) categories.critical.push(line);
    else if (result.important) categories.important.push(line);
    else if (result.needsReply) categories.needsReply.push(line);
    else categories.fyi.push(line);
    for (const finding of result.findings) {
      categories.calendar.push(`- ${finding.title}; date: ${finding.date}; amount: ${finding.amount || "n/a"}; source: ${finding.source}; confidence: ${finding.confidence}`);
    }
  }

  return [
    "## Gmail",
    `Messages scanned: ${messages.length}`,
    "",
    "### Critical",
    ...(categories.critical.length ? categories.critical : ["- None found."]),
    "",
    "### Important",
    ...(categories.important.length ? categories.important : ["- None found."]),
    "",
    "### Needs Reply",
    ...(categories.needsReply.length ? categories.needsReply : ["- None found."]),
    "",
    "### Calendar Actions To Approve",
    ...(categories.calendar.length ? categories.calendar : ["- None found."]),
    "",
    "### FYI",
    ...(categories.fyi.slice(0, 12).length ? categories.fyi.slice(0, 12) : ["- None found."])
  ].join("\n");
}

async function aiSummarize(mode, gmailMessages, connectorText) {
  if (!process.env.OPENAI_API_KEY) return deterministicGmailDigest(gmailMessages);

  const compact = gmailMessages.map((message) => ({
    source: message.source,
    from: message.sender,
    subject: message.subject,
    date: message.date,
    text: message.text.slice(0, 5000),
    attachments: message.attachments.map((item) => ({
      filename: item.filename,
      mime: item.mime,
      readable: item.readable,
      note: item.note
    }))
  }));

  const prompt = `Create a concise ${mode} email briefing. Categorize into Critical, Important, Needs Reply, Calendar Actions To Approve, Attachments, and FYI. Extract payment reminders with payee/vendor, amount, due date, source, and confidence. Never invent missing details.\n\nGmail messages:\n${JSON.stringify(compact)}\n\nConnector digest:\n${connectorText}`;

  const response = await fetchJson(OPENAI, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-5.2",
      input: prompt
    })
  });

  return response.output_text || response.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join("\n") || deterministicGmailDigest(gmailMessages);
}

async function sendEmail(token, to, subject, body) {
  const from = "me";
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ].join("\r\n");
  await fetchJson(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ raw: base64UrlEncode(raw) })
  });
  console.log(`Sent ${subject} to ${to}`);
}

async function main() {
  const mode = determineMode();
  const token = await gmailAccessToken();
  const gmailMessages = await readGmail(token, mode);
  const connectorDigest = await generateDigest(mode);
  const connectorText = renderDigest(connectorDigest);
  const gmailText = await aiSummarize(mode, gmailMessages, connectorText);
  const status = (await connectorStatus()).map((item) => `- ${item.name}: ${item.connected ? "connected" : "not configured"} (${item.mode})`).join("\n");
  const title = mode === "morning" ? "Morning Email Briefing" : "Evening Email Debrief";
  const body = [
    gmailText,
    "",
    "## LinkedIn / WhatsApp Connector Status",
    status,
    "",
    "## Connector Findings",
    connectorText
  ].join("\n");
  await sendEmail(token, required("DIGEST_TO"), title, body);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

