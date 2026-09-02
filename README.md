# SmartIntro for Gmail

A Google Workspace add-on that inserts a personalized greeting — `Hey Sarah!` — into your Gmail drafts based on the recipients in the To field, with one click.

## How it works

1. While composing an email, click the SmartIntro icon in the compose window.
2. SmartIntro reads the recipients in the To field and resolves their first names.
3. Click **Insert greeting** and `Hey Sarah!` (or `Hey Sarah and Bob!`) is inserted into the draft at your cursor.

Name resolution cascade:

1. **Google Contacts** — the contact's given name.
2. **Your mailbox** — the display name from the most recent email you received from that address (their `From:` header).
3. **Address parsing** — `sarah.johnson@example.com` → `Sarah`.

Role accounts (`support@`, `no-reply@`, ...) and recipients with no resolvable name are skipped and listed as "Not greeted".

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Add-on logic: compose UI card, name resolution, greeting insertion |
| `appsscript.json` | Apps Script manifest: triggers, scopes, add-on metadata |

## Setup

### 1. Create the Apps Script project

1. Go to https://script.google.com → **New project** → name it `SmartIntro`.
2. Replace the default file's contents with `Code.gs`.
3. In **Project Settings**, tick **Show "appsscript.json" manifest file**, then replace its contents with `appsscript.json`.

### 2. Link a user-managed GCP project

Apps Script will require this before deploying a Workspace add-on.

1. Go to https://console.cloud.google.com → **New Project** → name it `smartintro`.
2. Open https://console.cloud.google.com/iam-admin/settings and copy the **Project number**.
3. In Apps Script → **Project Settings → Google Cloud Platform (GCP) project → Change project** → paste the project number → **Set project**.
4. Configure the OAuth consent screen at https://console.cloud.google.com/apis/credentials/consent:
   - User type: **External**
   - App name: `SmartIntro`, your email for support and developer contact
   - Add your own email under **Test users**

### 3. Deploy and install

1. In Apps Script: **Deploy → New deployment → Google Workspace Add-on → Deploy**.
2. Authorize the requested scopes (choose **Advanced → Go to SmartIntro (unsafe)** if you see the unverified-app warning).
3. Under **Test deployments**, click **Install**.
4. Open Gmail, compose an email, add recipients, and click the SmartIntro icon (puzzle piece) in the compose window.

## Permissions

The add-on requests these scopes:

| Scope | Why |
|---|---|
| `gmail.addons.execute` | Base scope required to run a Gmail add-on |
| `gmail.addons.current.message.metadata` | Reads the draft's To/Cc/Bcc recipients |
| `gmail.addons.current.action.compose` | Allows compose actions (updating the active draft) |
| `gmail.readonly` | Searches past mail for recipient display names (step 2 of the cascade) |
| `contacts.readonly` | Looks up recipient names in Google Contacts (step 1 of the cascade) |

To reduce permissions, you can drop `gmail.readonly` and rely on Contacts + address parsing only — remove the `mailboxDisplayName` lookup in `Code.gs`.

## Limitations

- Compose-trigger cards must be confirmed with a button click — Google doesn't allow inserting text into a draft directly from the icon click.
- Recipients are exposed to add-ons as email addresses only (no display names), which is why name resolution needs Contacts/mailbox lookups.
- The compose `logoUrl` in `appsscript.json` is a placeholder — replace it with your own hosted image before publishing.
- This repo is set up for personal use as an unverified test install. Publishing to the Google Workspace Marketplace requires app verification and a Marketplace listing.
