#!/usr/bin/env node

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
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob"
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
  const params = new URLSearchParams({
    client_id: required("GOOGLE_CLIENT_ID"),
    redirect_uri: "urn:ietf:wg:oauth:2.0:oob",
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES.join(" ")
  });
  console.log(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

const command = process.argv[2] || "url";
if (command === "url") authUrl();
else if (command === "exchange") exchangeCode().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
else {
  console.error("Usage: node google-oauth-helper.js url|exchange");
  process.exitCode = 1;
}

