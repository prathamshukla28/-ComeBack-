# Monetization — ComeBack Pro

ComeBack ships a subscription paywall powered by [RevenueCat](https://www.revenuecat.com/),
which wraps Apple App Store and Google Play billing so you never touch raw
receipts. Premium features are gated behind a single **`pro`** entitlement.

## What's gated

| Free                         | ComeBack **Pro**                                   |
| ---------------------------- | -------------------------------------------------- |
| Habit + workout logging      | **AI Life Coach** (the `Coach` tab)                |
| Fitness Guru (direct Gemini) | RAG-grounded Guru on your own history _(optional)_ |
| Recent stats                 | Full history & progression _(optional)_            |

The Coach tab is gated out of the box (`app/(tabs)/coach.tsx`), and the Guru tab
uses the RAG service only for Pro users. To gate any other screen, read the flag:

```ts
import { useIsPro } from '@/lib/subscription';
const isPro = useIsPro();
```

or render `<Paywall feature="…" />` in place of the locked UI.

## How the code fits together

- `lib/purchases.ts` — thin, defensive RevenueCat wrapper. Loads the native SDK
  lazily so the app still runs on web, in Expo Go, and under Jest (Pro simply
  stays `false`). `hasProEntitlement()` is pure and unit-tested.
- `lib/subscription.tsx` — `SubscriptionProvider` + `useSubscription()` /
  `useIsPro()`. Mounted in `app/_layout.tsx`.
- `components/Paywall.tsx` + `app/paywall.tsx` — the paywall UI and its modal route.
- `lib/demo.ts` — dev-only demo-Pro switch (see below).

## Where Pro is enforced

The client-side flag decides what the UI shows. It cannot protect anything that
costs the operator money, because a modified client can flip it. So:

| Feature                         | Runs on                       | Enforced by                                 |
| ------------------------------- | ----------------------------- | ------------------------------------------- |
| Life Coach (direct Gemini)      | the user's **own** Gemini key | client paywall (nothing of yours is spent)  |
| RAG-grounded answers (`/rag/*`) | the **operator's** Gemini key | **server**: `rag/app/entitlements.py` → 403 |

Server-side enforcement uses `public.user_entitlements` (`db/entitlements.sql`):

- Clients may only **read** their own row (RLS). No insert/update/delete policy
  exists and those privileges are revoked, so nobody can self-grant Pro with the
  public anon key.
- The RAG service calls `has_entitlement('pro')` **with the user's JWT**, so RLS
  scopes the check to that user. No Pro → `403` before any Gemini call.
- The table is written only by the **RevenueCat webhook**
  (`POST /webhooks/revenuecat` in `rag/`), which calls the service-role-only
  `apply_entitlement_event()` and ignores out-of-order deliveries.

### Webhook setup

1. Run `db/entitlements.sql` in the Supabase SQL editor (after `db/schema.sql`).
2. In `rag/.env` set `REVENUECAT_WEBHOOK_SECRET` (a long random string) and
   `SUPABASE_SERVICE_ROLE_KEY`. Without the secret the endpoint returns 404.
3. RevenueCat → Project settings → Integrations → **Webhooks**: URL
   `https://<your-rag-host>/webhooks/revenuecat`, Authorization header = the secret.
4. Send a test event from the dashboard; the service answers `{"ok": true, "applied": 0}`.

The app sets the RevenueCat app user id to the Supabase user id
(`configurePurchases(userId)`), which is how webhook events map to `auth.users`.

For a reviewer or demo account you can grant Pro by hand from the SQL editor (see
the comment at the top of `db/entitlements.sql`).

## Demo mode (dev builds only)

To show the Coach without a sandbox purchase:

```bash
EXPO_PUBLIC_DEMO_PRO=1 npx expo start
```

The Coach tab then shows an amber **DEMO PRO** banner. The switch is inert in
production builds: it requires `__DEV__`, refuses when `NODE_ENV` is
`production`, and only ever changes the client flag. The RAG service still sees
a non-Pro user, so the Guru tab falls back to the direct Gemini path.

## Setup (one time)

1. **Create products** in App Store Connect and Google Play Console
   (e.g. `comeback_pro_monthly`, `comeback_pro_yearly`).
2. **RevenueCat dashboard** (app.revenuecat.com):
   - Create a project; add your iOS and Android apps.
   - Create an **entitlement** with identifier exactly **`pro`**.
   - Attach your store products to it, and add them to the **default offering**.
   - Copy the **public SDK keys** (`appl_…`, `goog_…`).
3. **Configure the app** — copy the keys into `.env`:

   ```bash
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_xxxxxxxx
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxxxxxxx
   ```

4. **Install + build a dev client** (in-app purchases need native code — they do
   _not_ work in Expo Go):

   ```bash
   npx expo install react-native-purchases
   npx expo prebuild
   npx expo run:ios      # or run:android
   ```

Without the keys, billing stays off and Pro features remain locked — the app
still builds and runs everywhere.

## Testing purchases

- iOS: use a **Sandbox tester** (App Store Connect → Users and Access).
- Android: add a **license tester** and use a closed/internal testing track.
- RevenueCat → Customer history shows events in real time.

## Changing the entitlement id

If you name the entitlement something other than `pro`, update
`PRO_ENTITLEMENT` in `lib/purchases.ts`.
