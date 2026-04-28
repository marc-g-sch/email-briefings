export function normalizeMessage(input) {
  return {
    id: input.id || `${input.source || "unknown"}-${input.date || Date.now()}-${Math.random().toString(16).slice(2)}`,
    source: input.source || "unknown",
    threadId: input.threadId || input.conversationId || null,
    sender: input.sender || input.from || "Unknown sender",
    recipients: input.recipients || [],
    subject: input.subject || input.chat || input.conversation || "",
    text: input.text || input.body || input.message || "",
    date: input.date ? new Date(input.date).toISOString() : new Date().toISOString(),
    attachments: input.attachments || [],
    url: input.url || null,
    raw: input.raw || null
  };
}

export function emptyDigest(mode) {
  return {
    mode,
    generatedAt: new Date().toISOString(),
    summary: [],
    categories: {
      critical: [],
      important: [],
      needsReply: [],
      calendarCandidates: [],
      completed: [],
      fyi: []
    },
    connectorStatus: [],
    messagesConsidered: 0
  };
}

