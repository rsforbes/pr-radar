# PR Radar

A desktop app that shows which GitHub pull requests need your attention. Add the repos you care about and PR Radar sorts every open PR you're involved in, as author or reviewer, into three groups:

- **Needs your action** – CI failing, unresolved review threads, changes requested, new comments, a review or re-review requested, replies to your comments, new commits since your review
- **Ready to merge** – your PRs that are approved
- **Waiting on others** – drafts, PRs waiting on reviewers, or PRs where the author has the next move

Built with [Tauri](https://tauri.app/) v2, React and TypeScript.

## Requirements

- [Node.js](https://nodejs.org/) and npm
- [Rust toolchain](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
- [GitHub CLI](https://cli.github.com/) (`gh`), installed and logged in (`gh auth login`)

PR Radar uses your existing `gh` login to query GitHub, so it never stores a token. If you're logged in to several accounts, pick one from the account dropdown in the header; this doesn't change the active account in your terminal.

## Getting started

```sh
npm install
npm run tauri dev
```

Use the **Group by** dropdown to organize PRs by status or by repo, and click a section heading to collapse it. Click **Repos**, add repos as `owner/name` or a GitHub URL, and the app fetches your PRs. It refreshes every 5 minutes, or on demand with **Refresh**.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run tauri dev` | Run the full desktop app with hot reload |
| `npm run tauri build` | Build a release bundle |
| `npm run dev` | Frontend only (GitHub and config calls need the Tauri shell) |
| `npm test` | Run the unit tests |
| `npm run build` | Type-check and build the frontend |

## Configuration

Settings are stored as `config.json` in the app's config directory:

```json
{ "repos": ["owner/name"], "pollMinutes": 5, "groupBy": "status", "collapsed": [], "account": null }
```

`groupBy` is `"status"` or `"repo"` and `collapsed` lists the sections you've collapsed; both are set from the UI. `account` is the `gh` login to use (`null` means the active one) and is set from the header dropdown. `pollMinutes` has no UI yet, so edit the file to change the refresh interval.

## Azure DevOps

PR Radar can also track Azure DevOps repos. Install the [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/) (`az`), run `az login`, then add a repo from its URL, for example `https://dev.azure.com/{org}/{project}/_git/{repo}` or the older `https://{org}.visualstudio.com/{project}/_git/{repo}`. The account dropdown only applies to GitHub.

## Project layout

See [CLAUDE.md](./CLAUDE.md) for the module map, design decisions and known gaps, and [docs/architecture.md](./docs/architecture.md) for how the app runs, how to build a release, and what is macOS-specific.
