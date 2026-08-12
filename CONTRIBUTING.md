# Contributing to ComeBack

Thanks for wanting to help. This document explains how to propose changes, the code standards, and the review process.

## Ways to contribute

- 🐛 **Report a bug** — open a [Bug Report](./.github/ISSUE_TEMPLATE/bug_report.yml)
- ✨ **Propose a feature** — open a [Feature Request](./.github/ISSUE_TEMPLATE/feature_request.yml)
- 📝 **Improve docs** — README, SETUP, comments
- 🧪 **Add tests** — coverage of untested code paths is always welcome
- 🎨 **Polish UI** — micro-interactions, accessibility, theming

For anything beyond a small fix, please open an issue first so we can align on approach.

## Development setup

Follow [`docs/SETUP.md`](./docs/SETUP.md) end-to-end. Verify locally:

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
```

All four must pass before opening a PR — the same gates run in CI.

## Branch & commit conventions

- Branch off `main`: `feat/short-description`, `fix/short-description`, `docs/…`, `chore/…`
- Commit messages follow **[Conventional Commits](https://www.conventionalcommits.org/)**. `commitlint` enforces this locally via a Husky hook.

Examples:

```
feat(coach): add streak-aware daily prompt
fix(auth): refresh session before biometric prompt
docs(readme): document EAS preview workflow
chore(deps): bump expo to 54.0.36
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

## Pull request checklist

- [ ] Linked to an issue (or explained why not)
- [ ] Follows Conventional Commits
- [ ] `npm run typecheck && npm run lint && npm run format:check && npm test` all green
- [ ] Added or updated tests for the change
- [ ] Updated docs / README when public behavior changes
- [ ] Screenshot or short screen recording for UI changes
- [ ] No secrets, keys, or personal data in the diff

## Code style

- TypeScript strict — no `any`, no `@ts-ignore` (use `unknown` + narrowing)
- Prefer functional components + hooks
- Keep components small and composable — the primitives in [`components/ui.tsx`](./components/ui.tsx) are the vocabulary
- Style with the theme (`useTheme`) — do not hard-code colors
- Handle loading, empty, and error states explicitly
- Any side effect inside a component belongs in `useEffect` with a proper cleanup

## Review process

Maintainers aim to respond within a week. Expect discussion — small, focused PRs merge fastest.

## Code of Conduct

Participation in this project is governed by the [Code of Conduct](./CODE_OF_CONDUCT.md).
