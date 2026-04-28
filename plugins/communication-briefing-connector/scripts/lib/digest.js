import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyDigest } from "./model.js";
import { ensureDir, dataDir } from "./paths.js";
import { classifyMessage } from "./classifier.js";
import { linkedinStatus, readLinkedInMessages } from "./linkedin.js";
import { whatsappStatus, readWhatsAppMessages } from "./whatsapp.js";

function withinWindow(message, mode) {
  const ageHours = (Date.now() - new Date(message.date).getTime()) / 36e5;
  return mode === "morning" ? ageHours <= 18 : ageHours <= 30;
}

function lineFor(message) {
  const subject = message.subject ? ` - ${message.subject}` : "";
  const preview = message.text.replace(/\s+/g, " ").slice(0, 180);
  return `- [${message.source}] ${message.sender}${subject}: ${preview}`;
}

function renderCalendarItem(item) {
  return [
    `- ${item.title}`,
    `  Date/time: ${item.date}`,
    `  Type: ${item.calendarType}`,
    `  Reminder: ${item.reminder}`,
    `  Source: ${item.source}`,
    `  Confidence: ${item.confidence}`,
    item.amount ? `  Amount: ${item.amount}` : null
  ].filter(Boolean).join("\n");
}

export async function connectorStatus() {
  return [await linkedinStatus(), await whatsappStatus()];
}

export async function collectMessages(mode) {
  const [linkedIn, whatsApp] = await Promise.all([
    readLinkedInMessages(),
    readWhatsAppMessages()
  ]);
  return [...linkedIn, ...whatsApp]
    .filter((message) => withinWindow(message, mode))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

export async function generateDigest(mode = "morning") {
  const digest = emptyDigest(mode);
  digest.connectorStatus = await connectorStatus();
  const messages = await collectMessages(mode);
  digest.messagesConsidered = messages.length;

  for (const message of messages) {
    const result = classifyMessage(message);
    if (result.critical) digest.categories.critical.push(lineFor(message));
    else if (result.important) digest.categories.important.push(lineFor(message));
    else if (result.needsReply) digest.categories.needsReply.push(lineFor(message));
    else digest.categories.fyi.push(lineFor(message));

    for (const finding of result.findings) {
      digest.categories.calendarCandidates.push(renderCalendarItem(finding));
    }
  }

  const disconnected = digest.connectorStatus.filter((status) => !status.connected).map((status) => status.name);
  if (disconnected.length) {
    digest.summary.push(`Not connected: ${disconnected.join(", ")}.`);
  }
  digest.summary.push(`${messages.length} non-email messages considered.`);
  digest.summary.push("Gmail bodies and attachments are handled by the Codex automation prompt.");
  return digest;
}

export function renderDigest(digest) {
  const title = digest.mode === "morning" ? "Morning Communication Briefing" : "Evening Communication Debrief";
  const sections = [
    `# ${title}`,
    "",
    `Generated: ${digest.generatedAt}`,
    "",
    "## Summary",
    ...digest.summary.map((item) => `- ${item}`),
    "",
    "## Connector Status",
    ...digest.connectorStatus.map((status) => `- ${status.name}: ${status.connected ? "connected" : "not connected"} (${status.mode}) - ${status.detail}`),
    "",
    "## Critical",
    ...(digest.categories.critical.length ? digest.categories.critical : ["- None found."]),
    "",
    "## Important",
    ...(digest.categories.important.length ? digest.categories.important : ["- None found."]),
    "",
    "## Needs Reply",
    ...(digest.categories.needsReply.length ? digest.categories.needsReply : ["- None found."]),
    "",
    "## Calendar Actions To Approve",
    ...(digest.categories.calendarCandidates.length ? digest.categories.calendarCandidates : ["- None found."]),
    "",
    "## FYI",
    ...(digest.categories.fyi.length ? digest.categories.fyi : ["- None found."])
  ];
  return sections.join("\n");
}

export async function writeDigest(mode) {
  const digest = await generateDigest(mode);
  const rendered = renderDigest(digest);
  const outDir = ensureDir(join(dataDir(), "digests"));
  const outFile = join(outDir, `${mode}-${new Date().toISOString().slice(0, 10)}.md`);
  writeFileSync(outFile, rendered);
  return { digest, rendered, outFile };
}

