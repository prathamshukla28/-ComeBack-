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

The Coach tab is gated out of the box (`app/(tabs)/coach.tsx`). To gate any
other screen, read the flag:

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
