# PR Radar

Desktop app (Tauri v2 + React 19 + TypeScript, Vite) that shows which GitHub PRs need the user's attention. It reads open PRs from a user-chosen list of repos and sorts each into a bucket:

- **action** – "Needs your action"
- **ready** – "Ready to merge"
- **waiting** – "Waiting on others"

The goal is a single glanceable view of "what do I need to do on PRs right now", for PRs the user authored or is reviewing.

## Commands

- `npm run tauri dev` – run the full app (needs Rust toolchain and `gh` logged in)
- `npm run dev` – frontend only (Tauri `invoke` calls will fail outside the Tauri shell)
- `npm test` – vitest (currently only `src/state/classify.test.ts`)
- `npm run build` – `tsc` + `vite build`

## Architecture

```
src-tauri/src/lib.rs   Rust commands: gh_graphql, gh_accounts, load_config, save_config
src/github/accounts.ts Lists logged-in gh accounts (gh_accounts command)
src/github/client.ts   GraphQL query + fetchRepos(); maps raw nodes to PullRequest
src/github/types.ts    PullRequest, Classified, Bucket and related types
src/state/classify.ts  Pure logic: classify(pr, me) -> Classified | null
src/store/config.ts    Config (repos, pollMinutes, groupBy, collapsed, account) load/save, parseRepo()
src/App.tsx            UI, polling, repo filter, group-by status/repo, collapsible sections, repo management
```

Data flow: `App` polls -> `fetchRepos` (one GraphQL query per repo, in parallel) -> `classify` each PR for the current user (`viewer.login`) -> render grouped by bucket, newest-updated first.

### Key decisions

- **Auth goes through the `gh` CLI**, not tokens. Rust spawns `gh api graphql --input -` and returns the raw JSON. The app never stores credentials.
- **Multiple `gh` accounts**: the header dropdown picks which logged-in account to use (`Config.account`, null = gh's active account). Rust fetches that account's token with `gh auth token --user` and passes it as `GH_TOKEN` for that request only; it never runs `gh auth switch`, so the user's CLI state is untouched.
- **`gh` is looked up in fixed paths** (`/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`) because macOS GUI apps don't inherit the shell PATH.
- **Config** is JSON in the Tauri app config dir (`config.json`), read and written via Rust commands.
- **`classify.ts` is pure** (no I/O) and is where the product behavior lives. Authored PRs: draft, CI failing, unresolved threads, changes requested (cleared by a newer commit), new top-level comments from others (cleared by any later activity of mine: comment, review, thread reply or push), approved. Reviewed PRs: review or re-review requested, replies to your threads, new commits since your review, else waiting. PRs the user isn't involved in return `null`. Change it together with tests.
- **Dock badge**: `App.tsx` sets the window badge count to the number of `action` PRs across all repos (ignores the repo filter). It needs the `core:window:allow-set-badge-count` permission in `src-tauri/capabilities/default.json`; capability changes need a full app restart, not just hot reload.
- Links open in the system browser via `@tauri-apps/plugin-opener`.

## Known gaps

- Review requests to **teams** are ignored (only individual `User` reviewers are read).
- Query limits with no paging: 50 PRs per repo, 50 threads, last 30 comments, last 50 reviews.
- One `gh` process per repo per refresh.
- No UI for `pollMinutes` (edit the config file).
- No desktop notifications, tray icon or badge count.
- No tests for `client.ts`, `config.ts` or the UI.
- Missing or unauthenticated `gh` (or a saved account that has since been logged out) surfaces as a raw error string per repo.

## Conventions

- Match the existing style: small modules, plain functions, no state library, no CSS framework (`App.css`).
- Keep GitHub response shaping in `src/github/`, and decision logic in `src/state/`.
- Don't add token handling or direct HTTP calls to GitHub without discussing it; the `gh` approach is deliberate.
