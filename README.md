<div align="center">

# ComeBack

**Rebuild your streak. Own your body. Reset your mind.**

A privacy-first habit and workout tracker with an AI coach — built with Expo, React Native, and Supabase.

[![CI](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/ci.yml/badge.svg)](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/ci.yml)
[![CodeQL](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/codeql.yml/badge.svg)](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/codeql.yml)
[![Release Please](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/release-please.yml/badge.svg)](https://github.com/prathamshukla28/-ComeBack-/actions/workflows/release-please.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Expo SDK 54](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://docs.expo.dev/versions/v54.0.0/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react&logoColor=white)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-fe5196?logo=conventionalcommits&logoColor=white)](https://www.conventionalcommits.org/)

<sub>Made with care · Runs on iOS, Android, and Web via Expo</sub>

</div>

---

## ✨ Features

- 📊 **Daily dashboard** — one-glance view of today's sets, streaks, and habits
- 🏋️ **Workout tracker** — log sets, reps, weights; visualize progression
- 🧘 **Habit journal** — track cigarettes, alcohol, intimacy with clean-streak counters
- 🧠 **AI Coach** — conversational check-ins powered by Google Gemini
- 🔒 **Biometric lock** — Face ID / Touch ID gate for sensitive tabs
- 🔔 **Local notifications** — gentle nudges when your streaks are on the line
- 🎨 **Adaptive theming** — polished light and dark palettes
- 🎉 **Delightful micro-interactions** — haptics, animated numbers, confetti wins
- ☁️ **Sync everywhere** — Supabase Postgres with row-level security

## 📱 Screenshots

> Screenshots and demo GIF coming soon. See [`docs/screenshots/`](./docs/screenshots).

| Today | Workout | Habits | Coach |
| :---: | :-----: | :----: | :---: |
| _tbd_ |  _tbd_  | _tbd_  | _tbd_ |

## 🧱 Tech Stack

| Layer         | Choice                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------ |
| **Runtime**   | Expo SDK 54, React Native 0.81, React 19                                                   |
| **Language**  | TypeScript 5.9 (strict)                                                                    |
| **Routing**   | [expo-router](https://docs.expo.dev/router/introduction/) (file-based)                     |
| **State**     | [Zustand](https://github.com/pmndrs/zustand), [TanStack Query](https://tanstack.com/query) |
| **Data**      | [Supabase](https://supabase.com/) (Postgres, Auth, RLS)                                    |
| **AI**        | Google Gemini via `lib/gemini.ts`                                                          |
| **Animation** | `react-native-reanimated` v4 + Worklets                                                    |
| **Storage**   | `expo-secure-store`, `@react-native-async-storage/async-storage`                           |
| **Quality**   | ESLint, Prettier, Husky, lint-staged, commitlint, Jest, GitHub Actions, CodeQL, Dependabot |

## 🚀 Quick Start

**Prerequisites:** [Node.js 22+](https://nodejs.org), a free [Supabase](https://supabase.com) project, the [Expo Go](https://expo.dev/client) app on your phone.

```bash
# 1. Clone
git clone https://github.com/prathamshukla28/-ComeBack-.git comeback
cd comeback

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# then edit .env with your Supabase URL + anon key

# 4. Run
npm start          # then scan the QR code with Expo Go
npm run ios        # or open on iOS simulator
npm run android    # or Android emulator
npm run web        # or in the browser
```

Full walk-through with Supabase provisioning and schema import lives in [`docs/SETUP.md`](./docs/SETUP.md).

## 📁 Project Structure

```text
.
├── app/                    # expo-router file-based routes
│   ├── (tabs)/             # Bottom-tab navigator
│   │   ├── index.tsx       # Today dashboard
│   │   ├── workout.tsx     # Workout logger
│   │   ├── habits.tsx      # Habit journal
│   │   ├── intimacy.tsx    # Private tab (biometric-gated)
│   │   ├── guru.tsx        # Guided routines
│   │   ├── coach.tsx       # AI chat
│   │   └── settings.tsx    # Preferences
│   ├── _layout.tsx         # Root providers, theme, error boundary
│   ├── login.tsx           # Supabase auth screen
│   └── modal.tsx           # Reusable modal route
├── components/             # Reusable UI primitives + widgets
│   ├── ui.tsx              # Screen, Card, H1/H2, P, Button, StatRow, ...
│   ├── Chat.tsx            # AI coach chat surface
│   ├── AnimatedNumber.tsx  # Reanimated count-up
│   └── Confetti.tsx        # Win animation
├── lib/                    # Non-UI logic
│   ├── supabase.ts         # Supabase client
│   ├── auth.tsx            # Auth context + hooks
│   ├── queries.ts          # TanStack Query fns
│   ├── gemini.ts           # AI coach client
│   ├── theme.ts            # Theme hook + palettes
│   ├── haptics.ts          # Haptic helpers
│   ├── notifications.ts    # Local notification schedulers
│   ├── secureStore.ts      # expo-secure-store helpers
│   └── env.ts              # zod-validated env
├── constants/              # Design tokens (colors)
├── db/                     # SQL schema for Supabase
├── docs/                   # Extended documentation
├── .github/                # Workflows, templates, dependabot
└── assets/                 # Fonts, icons, images
```

## 🛠️ Scripts

| Script                  | Purpose                        |
| ----------------------- | ------------------------------ |
| `npm start`             | Start Metro / Expo dev server  |
| `npm run ios`           | Launch on iOS Simulator        |
| `npm run android`       | Launch on Android emulator     |
| `npm run web`           | Launch web build               |
| `npm run typecheck`     | `tsc --noEmit`                 |
| `npm run lint`          | ESLint over the source tree    |
| `npm run lint:fix`      | ESLint with `--fix`            |
| `npm run format`        | Prettier write across the repo |
| `npm run format:check`  | Prettier verify (CI-friendly)  |
| `npm test`              | Run Jest test suite            |
| `npm run test:watch`    | Jest in watch mode             |
| `npm run test:coverage` | Jest with coverage report      |

## 🧪 Quality Gates

Every push and PR runs through:

- ✅ **TypeScript strict** — `tsc --noEmit` must be error-free
- ✅ **ESLint** (`eslint-config-expo` + Prettier compatibility) — `--max-warnings=0`
- ✅ **Prettier** formatting check
- ✅ **Jest** — currently **37 tests** across `lib/env`, `lib/coach-messages`, `lib/queries` with coverage uploaded to Codecov
- ✅ **markdownlint-cli2** — docs quality
- ✅ **CodeQL** security scanning (JavaScript/TypeScript, `security-and-quality` query set)
- ✅ **Dependabot** — grouped weekly updates for npm and GitHub Actions
- ✅ **release-please** — automated CHANGELOG + version bumps from Conventional Commits
- ✅ **Stale bot** — hygiene sweep for abandoned issues/PRs
- ✅ **EAS Preview** (opt-in) — automated iOS/Android builds on PRs when `EXPO_TOKEN` is configured

Locally, Husky wires the same guardrails into:

- **pre-commit** — `lint-staged` runs ESLint + Prettier on staged files
- **commit-msg** — `commitlint` enforces Conventional Commits
- **pre-push** — full typecheck + test suite before anything leaves your machine

## 🤝 Contributing

Contributions are welcome. Please read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and follow the [Code of Conduct](./CODE_OF_CONDUCT.md). All commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).

## 🔐 Security

Found a vulnerability? Please **do not** open a public issue. Review [`SECURITY.md`](./SECURITY.md) for private disclosure instructions.

## 📜 License

[MIT](./LICENSE) © Pratham Shukla
