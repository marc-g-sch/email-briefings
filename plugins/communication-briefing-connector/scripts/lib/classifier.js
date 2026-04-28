const criticalTerms = [
  "overdue", "past due", "final notice", "urgent", "action required", "deadline",
  "late fee", "suspended", "termination", "legal", "security alert"
];

const paymentTerms = [
  "payment reminder", "invoice", "bill", "amount due", "due date", "pay by",
  "zahlungserinnerung", "rechnung", "mahnung", "faellig", "fällig"
];

const replyTerms = [
  "please reply", "can you confirm", "let me know", "rsvp", "antworten",
  "bitte bestaetigen", "bitte bestätigen"
];

const datePatterns = [
  /\b(?:due|by|before|on)\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b/i,
  /\b(\d{1,2}[./]\d{1,2}[./]\d{2,4})\b/,
  /\b(\d{4}-\d{2}-\d{2})\b/
];

const amountPattern = /(?:EUR|USD|GBP|€|\$|£)\s?([0-9][0-9.,]*)|([0-9][0-9.,]*)\s?(?:EUR|USD|GBP|€|\$|£)/i;

function lower(message) {
  return `${message.subject || ""}\n${message.text || ""}`.toLowerCase();
}

function findDate(text) {
  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function findAmount(text) {
  const match = text.match(amountPattern);
  return match ? match[0] : null;
}

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function vendorFromMessage(message) {
  const subject = message.subject?.replace(/^(re|fwd?):\s*/i, "").trim();
  if (subject) return subject.slice(0, 80);
  return message.sender;
}

export function classifyMessage(message) {
  const haystack = lower(message);
  const fullText = `${message.subject || ""}\n${message.text || ""}`;
  const important = hasAny(haystack, criticalTerms);
  const payment = hasAny(haystack, paymentTerms);
  const needsReply = hasAny(haystack, replyTerms) || /\?$/.test(message.text.trim());
  const date = findDate(fullText);
  const amount = findAmount(fullText);
  const calendarWorthy = Boolean(date) || payment;

  const findings = [];
  if (payment) {
    findings.push({
      type: "payment",
      title: `Payment due: ${vendorFromMessage(message)}`,
      date: date || "Date not found",
      calendarType: "all-day",
      amount: amount || "Amount not found",
      source: `${message.source}: ${message.sender}`,
      confidence: date ? "high" : "medium",
      reminder: date ? "Remind 3 days before and on the due date" : "Ask for due date before adding"
    });
  } else if (calendarWorthy) {
    findings.push({
      type: "calendar",
      title: vendorFromMessage(message),
      date,
      calendarType: "timed or all-day, needs review",
      source: `${message.source}: ${message.sender}`,
      confidence: "medium",
      reminder: "Remind 1 day before"
    });
  }

  return {
    message,
    important,
    critical: important && hasAny(haystack, ["overdue", "final notice", "suspended", "termination", "legal", "security alert"]),
    needsReply,
    calendarWorthy,
    findings
  };
}

