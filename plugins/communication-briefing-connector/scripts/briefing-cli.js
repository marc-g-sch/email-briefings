#!/usr/bin/env node
import { connectorStatus, writeDigest } from "./lib/digest.js";
import { startWhatsAppWebhook } from "./lib/whatsapp.js";

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const command = process.argv[2] || "status";

  if (command === "status") {
    console.log(JSON.stringify(await connectorStatus(), null, 2));
    return;
  }

  if (command === "digest") {
    const mode = arg("--mode", "morning");
    const result = await writeDigest(mode);
    console.log(result.rendered);
    console.log(`\nWrote ${result.outFile}`);
    return;
  }

  if (command === "whatsapp-webhook") {
    startWhatsAppWebhook();
    return;
  }

  if (command === "self-test") {
    const statuses = await connectorStatus();
    if (!Array.isArray(statuses) || statuses.length !== 2) {
      throw new Error("Expected LinkedIn and WhatsApp connector statuses.");
    }
    await writeDigest("morning");
    await writeDigest("evening");
    console.log("self-test ok");
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});

