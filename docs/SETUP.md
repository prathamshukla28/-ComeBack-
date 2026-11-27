# ComeBack — Setup Guide

Everything you need to run **ComeBack** on your iPhone. Total time: ~20 minutes.

You'll do this **once**. After that, running the app is just `npm start` + scan QR.

---

## What you need

- [x] A Mac (you have this ✅)
- [x] Node.js 22 (already installed ✅)
- [ ] Your iPhone
- [ ] A Google account (for free Gemini API)
- [ ] An email address (for Supabase)

**Total cost: $0.**

---

## Step 1 — Install Expo Go on your iPhone

1. Open the **App Store** on your iPhone
2. Search for **Expo Go**
3. Install it (it's free, made by Expo)

That's it. Don't open it yet.

---

## Step 2 — Create a free Supabase project (2 min)

Supabase = your app's cloud database. Free tier is plenty.

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub or email
2. Click **New project**
3. Fill in:
   - **Name**: `comeback`
   - **Database password**: click "Generate a password", **copy it somewhere safe** (you won't need it day-to-day, but don't lose it)
   - **Region**: pick the closest one to you
4. Click **Create new project**. Wait ~1 minute while it provisions.

### 2a — Run the database schema

1. In your Supabase project, click **SQL Editor** in the left sidebar → **New query**
2. Open `db/schema.sql` from this project on your Mac, copy the **entire file**
3. Paste it into the Supabase SQL editor
4. Click **Run** (or Cmd+Enter). You should see "Success. No rows returned."
5. Optional (only if you'll run the RAG service in `rag/` or sell Pro): run
   `db/rag.sql` and then `db/entitlements.sql` the same way. If your project ran an
   older `db/rag.sql` (one that created `ivfflat` indexes), also run
   `db/migrations/001_rag_exact_vector_search.sql` (why: `docs/RAG.md`).

### 2b — Get your Supabase keys

1. In Supabase, click **Project Settings** (gear icon, bottom-left) → **API**
2. Copy these two values (you'll paste them in Step 4):
   - **Project URL** → looks like `https://xxxxxxxxxxxx.supabase.co`
   - **anon / public key** → a long string starting with `eyJ...`

### 2c — Create your login

1. Click **Authentication** → **Users** → **Add user** → **Create new user**
2. Enter your email + a password (this is what you'll log into the ComeBack app with)
3. Check **Auto Confirm User** (skips email verification)
4. Click **Create user**

---

## Step 3 — Get a free Gemini API key (1 min)

Gemini = the AI for your Fitness Guru + Life Coach chats. Free tier: 1,500 messages/day.

1. Go to <https://aistudio.google.com/apikey> → sign in with your Google account
2. Click **Create API key** → **Create API key in new project**
3. Copy the key (starts with `AIza...`) — you'll paste it into the app itself in Step 5

---

## Step 4 — Configure the app with your Supabase keys

1. In the `ComeBack` folder on your Mac, create a file called `.env` (note the leading dot)
2. Paste this into it, replacing the two placeholder values with what you copied in step 2b:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...your-long-key...
   ```

3. Save the file.

---

## Step 5 — Run the app

Open Terminal in the `ComeBack` folder and run:

```bash
npm start
```

You'll see a **QR code** in the terminal.

1. Open the **Camera** app on your iPhone
2. Point it at the QR code
3. Tap the "Open in Expo Go" banner that appears
4. ComeBack launches on your iPhone. 🎉

**First time will take 30–60 seconds** to bundle. After that it's instant.

### 5a — Log in

- Use the email + password you created in step 2c

### 5b — Paste your Gemini key

- Open the **Settings** tab in the app
- Paste your Gemini API key (from step 3)
- Tap **Save**

The key is stored encrypted **only on your iPhone** — it never touches Supabase or any server.

---

## Daily use after setup

Just run:

```bash
npm start
```

Scan the QR with your iPhone camera. Done.

**Your Mac must be on the same Wi-Fi as your iPhone** for Expo Go to connect.

---

## Troubleshooting

| Problem                                 | Fix                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| QR code won't scan                      | Make sure iPhone + Mac are on the same Wi-Fi. Or press `s` in terminal to switch to tunnel mode.               |
| "Network response timed out" in Expo Go | In terminal press `s`, then re-scan the new QR.                                                                |
| App crashes on open                     | In terminal, press `r` to reload.                                                                              |
| Forgot Supabase password                | Doesn't matter — you don't log into Supabase from the app, only via web dashboard. Reset there if you need to. |
| Gemini says "quota exceeded"            | You hit 1500 msg/day (unlikely). Wait until tomorrow, or upgrade to paid ($).                                  |

---

## What's next

- **Grounded answers** — run the optional RAG service: [`rag/README.md`](../rag/README.md).
- **Subscriptions** — RevenueCat + server-side Pro: [`MONETIZATION.md`](./MONETIZATION.md).
- **Demo the Pro-only Life Coach** in a dev build without a purchase:
  `EXPO_PUBLIC_DEMO_PRO=1 npx expo start` (inert in production builds).

## Building installable apps with EAS (optional)

Expo Go is enough for day-to-day use. When you want a real install — an Android APK
to side-load, or a store build — use [EAS Build](https://docs.expo.dev/build/introduction/).
[`eas.json`](../eas.json) defines three profiles and holds **no secrets**:

| Profile       | What you get                                                                 | Distribution            |
| ------------- | ---------------------------------------------------------------------------- | ----------------------- |
| `development` | A development build (your own "Expo Go" with this app's native code)         | internal (ad hoc / APK) |
| `preview`     | A release-mode build to test; on Android an **`.apk`** you can side-load     | internal                |
| `production`  | Store builds (Android App Bundle, iOS archive); build number auto-increments | store                   |

One-time setup:

```bash
npm install -g eas-cli          # needs eas-cli >= 16 (see "cli" in eas.json)
eas login
eas init                        # links an Expo project; writes extra.eas.projectId to app.json
```

The first `eas build` asks for an iOS bundle identifier and an Android package name
(e.g. `com.yourname.comeback`) and saves them to `app.json`; pick your own, they are
permanent once published. Version numbers live on EAS (`"appVersionSource": "remote"`).

**Environment variables.** `.env` is git-ignored, so it is **not** uploaded to EAS.
Each profile reads the EAS environment of the same name (`"environment"` in
`eas.json`). Add the same public values as your `.env` to each one you use:

```bash
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://xxxxxxxxxxxx.supabase.co --visibility plaintext
eas env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value eyJ... --visibility plaintext
# optional: EXPO_PUBLIC_RAG_URL, EXPO_PUBLIC_REVENUECAT_IOS_KEY / _ANDROID_KEY
```

These `EXPO_PUBLIC_*` values are bundled into the app and are public by design;
never put a service-role key or any other secret in an EAS environment the app
reads. Users still paste their own Gemini key in Settings.

Build:

```bash
eas build --profile preview --platform android   # → .apk download link
eas build --profile production --platform all    # store builds
eas submit --profile production --platform ios   # later, when you have store accounts
```

Notes:

- The `development` profile needs `expo-dev-client`, which is not installed by
  default because it adds native code. Run `npx expo install expo-dev-client` before
  your first `eas build --profile development`. `preview` and `production` don't need it.
- Internal iOS builds need an Apple Developer account and registered devices
  (`eas device:create`). The Android APK needs nothing extra.
- The opt-in `EAS Preview` workflow (`.github/workflows/eas-preview.yml`) runs
  `eas build --profile preview --platform all --non-interactive` on PRs once
  `EXPO_TOKEN` is set. Non-interactive builds can't answer prompts, so run one build
  locally first (so the project id, bundle identifier and package name are in
  `app.json`) and set up iOS credentials, or the iOS half will fail.
- Building and submitting are production actions: they spend EAS build minutes and
  publish to stores. Nothing in this repo runs them automatically without your token.

## RLS integration test (optional, local only)

`db/__tests__/rls.integration.test.ts` signs in two real users against a local
Supabase stack and proves that one cannot read, change, or delete the other's rows,
that the anon key cannot touch the exercise presets, that nobody can self-grant Pro,
and that duplicate set numbers are rejected. It is skipped (one visible placeholder
test) unless the variables below are set, so `npm test` and CI never need a database.

```bash
# needs the Supabase CLI + Docker
supabase start                                  # prints API URL, anon + service_role keys
DB=postgresql://postgres:postgres@127.0.0.1:54322/postgres
psql "$DB" -f db/schema.sql -f db/rag.sql -f db/entitlements.sql

SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_ANON_KEY=<anon key> \
SUPABASE_TEST_SERVICE_ROLE_KEY=<service_role key> \
npm run test:rls
```

It creates and deletes two throwaway auth users. **Never point it at a production
project.**
