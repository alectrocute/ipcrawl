# Contributing to IP Crawl

Thank you for your interest in contributing! This document outlines the rules and
process for contributing to this project.

## Contributor Requirements

### Human-Operated Accounts Only

All contributions must come from a **human-operated GitHub account**. Bot
accounts, automated scripts, and AI-agent-operated accounts are not permitted to
open pull requests. This is enforced via CI — every PR is checked against a
known list of bot accounts and patterns.

If your account is flagged in error, comment on the PR and a maintainer will
override the check.

### Behavior-Only Test Coverage

Every change that modifies application code must include **behavior-only** test
coverage. This means:

- **E2E tests** (Playwright) that exercise the feature from the user's
  perspective — clicking buttons, filling forms, observing rendered output.
- **API integration tests** that send real HTTP requests and assert on responses.

We do **not** require unit tests for internal implementation details. Tests
should describe *what* the system does, not *how* it does it. A PR that changes
a component or API route must include at least one Playwright spec or API
integration spec that exercises the changed behavior.

## Development Setup

```bash
# Clone and install
git clone https://github.com/iptv-crawler/ipcrawl.git
cd ipcrawl
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your Shodan API key

# Start dev server (Node mode)
pnpm run dev
```

## Project Structure

```
app/             Root app shell, global CSS, theme
layers/
  explore/       Catalog UI mounted at /
  fun/           CRT roulette viewer at /fun
  imce/          "Is My Camera Exposed?" scan at /imce
  map/           Map explorer at /map
server/          Shared Nitro handlers, camera ingestion, live probing
shared/          API contracts shared between client and server
migrations/      D1 database migrations
```

## Pull Request Process

1. **Open an issue first** for anything beyond a trivial fix. Discuss the
   approach before writing code.
2. **Branch** from `main` with a descriptive name (`feat/thing`,
   `fix/issue-123`).
3. **Write behavior tests** that cover your change.
4. **Run the full CI suite locally** before pushing:
   ```bash
   pnpm run lint
   pnpm run typecheck
   pnpm run test:e2e
   ```
5. **Open the PR** — the CI will run lint, typecheck, e2e tests, the
   human-account check, and the behavior-test coverage check. All must pass.
6. **Keep PRs small** — one concern per PR. Large PRs are harder to review and
   more likely to be rejected.

## Code Style

- TypeScript with strict mode (`vue-tsc` typecheck required).
- ESLint with Nuxt config (run `pnpm run lint`).
- No trailing commas, 1TBS brace style (configured in `nuxt.config.ts`).
- Indent with 2 spaces, LF line endings (see `.editorconfig`).

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
type(scope): summary

- feat: new feature
- fix: bug fix
- docs: documentation only
- refactor: code change with no behavior change
- test: adding or updating tests
- chore: tooling, CI, dependencies
```

## License

By contributing, you agree that your contributions will be licensed under the
MIT License.
