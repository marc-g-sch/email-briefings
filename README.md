# Communication Briefing Connector

This workspace contains a local Codex plugin and Node service for morning and evening communication briefings.

What is live now:

- Codex Automations tab has two scheduled jobs: `Morning email briefing` at 08:00 and `Evening email debrief` at 20:00.
- Those automations inspect Gmail message bodies and readable attachments through the Codex Gmail connector.
- This plugin adds connector plumbing for non-email channels.

Connector support:

- Gmail: handled by Codex Gmail tools in the automation.
- LinkedIn: supported through exported message data or an approved API/partner endpoint. Personal inbox scraping is intentionally not the default because it is brittle and may violate platform rules.
- WhatsApp: supported through exported chat files or WhatsApp Business Cloud webhook payloads. Personal WhatsApp app inbox scraping is intentionally not the default.

Useful commands:

```bash
npm run briefing:status
npm run briefing:morning
npm run briefing:evening
npm run briefing:webhook
npm test
```

## Host It On GitHub Actions

This is the easiest hosted option because it runs on GitHub's servers even when the laptop is shut.

What has already been added:

- `.github/workflows/communication-briefing.yml` locally. GitHub may require you to add this file through the browser or push with a token that has `workflow` scope.
- `npm run hosted:digest`
- Google OAuth helper commands

The workflow runs at the Berlin 08:00 and 20:00 windows. GitHub cron uses UTC, so the workflow fires at both possible DST offsets and the script exits unless the current Europe/Berlin hour is exactly 08 or 20.

### 1. Put This Folder In A GitHub Repo

Create a new private GitHub repository, then upload/push this folder:

```bash
git init
git add .
git commit -m "Add hosted communication briefing"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```

This machine currently does not have the `gh` CLI installed, so Codex cannot create/push the repo for you automatically from here.

### 2. Create Google OAuth Credentials

In Google Cloud:

- Create or open a Google Cloud project.
- Enable the Gmail API.
- Configure OAuth consent for your account.
- Create OAuth client credentials.
- The hosted job needs these scopes:
  - `https://www.googleapis.com/auth/gmail.readonly`
  - `https://www.googleapis.com/auth/gmail.send`

Set your local environment temporarily:

```bash
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
npm run google:oauth-url
```

Open the printed URL, approve access, and copy the returned code. Then:

```bash
export GOOGLE_AUTH_CODE="..."
npm run google:oauth-exchange
```

Copy the `refresh_token` from the output.

### 3. Add GitHub Secrets

In the GitHub repo, go to Settings -> Secrets and variables -> Actions -> New repository secret.

Add:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DIGEST_TO` with `marc.schuhbauer@gmail.com`
- `OPENAI_API_KEY` if you want AI-written summaries instead of the deterministic fallback

### 4. Run It

Make sure this workflow file exists in GitHub:

- `.github/workflows/communication-briefing.yml`

If GitHub rejected the workflow push with a `workflow` scope error, create that file in the GitHub browser and paste the local file contents from this workspace.

Go to Actions -> Communication Briefing -> Run workflow.

Choose:

- `morning`
- `evening`
- or `auto`

If the secrets are correct, GitHub will read Gmail, summarize, and send the briefing email even if the laptop is shut.

Data locations:

- `data/linkedin/messages.json` or `data/linkedin/messages.csv`
- `data/whatsapp/chats/*.txt` for exported chats
- `data/whatsapp/webhook-events.jsonl` for webhook events
- `data/digests/` for generated digest previews

The digest output includes calendar candidates such as payment due reminders with title, date, all-day/timed type, source, confidence, and reminder recommendation.
