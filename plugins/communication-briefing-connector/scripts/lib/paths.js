import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export function workspaceRoot() {
  return resolve(new URL("../../../../", import.meta.url).pathname);
}

export function dataDir() {
  return resolve(workspaceRoot(), process.env.BRIEFING_DATA_DIR || "data");
}

export function ensureDir(path) {
  mkdirSync(path, { recursive: true });
  return path;
}

