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

1. Go to https://supabase.com → **Start your project** → sign in with GitHub or email
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

1. Go to https://aistudio.google.com/apikey → sign in with your Google account
2. Click **Create API key** → **Create API key in new project**
3. Copy the key (starts with `AIza...`) — you'll paste it into the app itself in Step 5

---

## Step 4 — Configure the app with your Supabase keys

1. In the `ComeBack` folder on your Mac, create a file called `.env` (note the leading dot)
2. Paste this into it, replacing the two placeholder values with what you copied in step 2b:

   ```
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

| Problem | Fix |
|---|---|
| QR code won't scan | Make sure iPhone + Mac are on the same Wi-Fi. Or press `s` in terminal to switch to tunnel mode. |
| "Network response timed out" in Expo Go | In terminal press `s`, then re-scan the new QR. |
| App crashes on open | In terminal, press `r` to reload. |
| Forgot Supabase password | Doesn't matter — you don't log into Supabase from the app, only via web dashboard. Reset there if you need to. |
| Gemini says "quota exceeded" | You hit 1500 msg/day (unlikely). Wait until tomorrow, or upgrade to paid ($). |

---

## What's next

After you confirm Phase 1 opens on your iPhone and you can log in:

- **Phase 2** — Workout logging + habits (cigs, alcohol) + Dashboard
- **Phase 3** — Intimacy tab with FaceID lock
- **Phase 4** — Fitness Guru + Life Coach AI chats
- **Phase 5** — Weekly summaries + data export

Reply "Phase 1 works" when you can log in on your iPhone, and I'll build Phase 2.
