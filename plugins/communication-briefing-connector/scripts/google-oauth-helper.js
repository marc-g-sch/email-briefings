#!/usr/bin/env node

import { createServer } from "node:http";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send"
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function exchangeCode() {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    code: required("GOOGLE_AUTH_CODE"),
    grant_type: "authorization_code",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:8788/oauth2callback"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  console.log(text);
}

function authUrl() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:8788/oauth2callback";
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES.join(" ")
  });
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

async function exchangeCodeValue(code) {
  const body = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    client_secret: required("GOOGLE_CLIENT_SECRET"),
    code,
    grant_type: "authorization_code",
    redirect_uri: process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:8788/oauth2callback"
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body
  });
  const text = await response.text();
  if (!response.ok) throw new Error(text);
  return JSON.parse(text);
}

async function localFlow() {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://127.0.0.1:8788/oauth2callback";
  const url = new URL(redirectUri);
  const port = Number(url.port || 8788);

  console.log("Open this URL and approve Gmail access:");
  authUrl();
  console.log("");
  console.log(`Waiting for Google redirect on ${redirectUri}`);

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url || "/", redirectUri);
      if (requestUrl.pathname !== url.pathname) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const error = requestUrl.searchParams.get("error");
      if (error) throw new Error(error);
      const code = requestUrl.searchParams.get("code");
      if (!code) throw new Error("Missing code in Google redirect.");
      const token = await exchangeCodeValue(code);
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("Success. You can close this tab and return to Codex.");
      console.log("");
      console.log("Add this value to GitHub as GOOGLE_REFRESH_TOKEN:");
      console.log(token.refresh_token || "(No refresh_token returned. Re-run with prompt=consent or delete prior app access.)");
      server.close();
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error.message);
      console.error(error.message);
      server.close();
      process.exitCode = 1;
    }
  });

  server.listen(port, "127.0.0.1");
}

const command = process.argv[2] || "url";
if (command === "url") authUrl();
else if (command === "exchange") exchangeCode().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
else if (command === "local") localFlow().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
else {
  console.error("Usage: node google-oauth-helper.js url|exchange|local");
  process.exitCode = 1;
}
