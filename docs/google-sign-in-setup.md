# Setting up the Google sign-in key

The app's "sign in with Google" step (used when you add another Google account as a
new Gmail, Calendar or Drive app) needs a Google sign-in key, an **OAuth client ID**.
The key is built into the app when GitHub builds the installers, so it has to be stored
in the repo's GitHub secrets.

The app only asks Google for your **email address and name** (basic scopes), so the key
does not need Google's app review.

Do these steps in a web browser on any computer.

## 1. Create a project

1. Go to <https://console.cloud.google.com/> and sign in with your main Google account.
2. Click the project picker at the top, then **New Project**.
3. Name it `multiapp`, click **Create**, and make sure it's selected at the top.

## 2. Turn on the People API

The app uses it to read your name and email after sign-in.

1. Left menu → **APIs & Services → Library**.
2. Search for **People API**, open it, and click **Enable**.

## 3. Set up the sign-in screen

1. Left menu → **APIs & Services → OAuth consent screen**, then **Get started**.
2. Fill in:
   - App name: `multiapp`
   - Support email: yours
   - Audience: **External**
   - Contact email: yours
3. Accept the terms and click **Create**.
4. Go to the **Audience** page, click **Publish app**, and confirm.
   - If you leave it in "Testing", sign-ins expire every 7 days.
   - Because the app only asks for email and name, publishing needs no review from Google.

## 4. Create the key

1. Go to **Clients → Create client**.
2. Application type: **Desktop app**. Name: `multiapp desktop`.
3. Click **Create**.
4. A box shows a **Client ID** and a **Client secret**. Keep it open, or click download
   to save them.

## 5. Add the key to the GitHub repo

1. Go to <https://github.com/delkem/multiapp/settings/secrets/actions>.
2. Click **New repository secret** and add:
   - Name `GOOGLE_CLIENT_ID`, value: your Client ID
3. Click **New repository secret** again and add:
   - Name `GOOGLE_CLIENT_SECRET`, value: your Client secret

Don't paste the ID or secret into chats, issues or files in the repo. GitHub secrets are
the only place they need to go.

## After that

Builds started on GitHub (by pushing to the `release` branch) pick up the key
automatically. Installers built before the secrets were added don't have it, so adding
a new Google account through the app's sign-in step won't work in those builds.

### Technical details

- Sign-in uses a loopback redirect (`http://127.0.0.1:42813/callback`), which
  **Desktop app** clients allow without any extra configuration.
- Scopes requested: `userinfo.email` and `userinfo.profile`
  (see `packages/app/src/user-identities/duck.ts`).
- The ID and secret are injected at build time by `packages/app/webpack.config.common.js`
  from the `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` environment variables, which the
  release workflows (`.github/workflows/release*.yml`) read from the repo secrets.
