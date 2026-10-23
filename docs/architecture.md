# Architecture and platform notes

For the module map, classification rules and known gaps, see [CLAUDE.md](../CLAUDE.md). This doc covers how the app runs, how it is built, and what is platform-specific.

## How it runs

The app is a Tauri v2 desktop app: two halves in one process tree.

- **Frontend**: React and TypeScript, bundled by Vite into static files (`dist/`). It runs in the OS's native webview (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux), not a bundled Chromium.
- **Backend**: a small Rust program (`src-tauri/src/lib.rs`) that owns the window and exposes commands the frontend calls with `invoke`: `gh_graphql`, `gh_accounts`, `az_rest`, `load_config`, `save_config`. It contains no GitHub or ADO logic. It spawns the `gh` and `az` CLIs and returns their output.

All product logic (fetching, classifying, polling, rendering) is TypeScript. `npm run tauri dev` serves the frontend from Vite on port 1420 with hot reload and compiles the Rust side.

## Authentication

Nothing in the app stores credentials.

- **GitHub** uses the `gh` CLI's login. For a non-default account, Rust reads that account's token with `gh auth token --user` and passes it as `GH_TOKEN` for a single request.
- **Azure DevOps** uses the `az` CLI's login via `az rest --resource <ADO_RESOURCE>`. `ADO_RESOURCE` is the public, well-known Entra application ID of the Azure DevOps service, identical for every organization and tenant. `az rest` needs it because it doesn't recognize `dev.azure.com` on its own. Only `dev.azure.com` URLs are accepted, so the token can't be sent elsewhere.

## ADO URL forms

`parseAdoRepo` (`src/ado/repo.ts`) accepts `https://dev.azure.com/{org}/{project}/_git/{repo}` and the legacy `https://{org}.visualstudio.com/[DefaultCollection/]{project}/_git/{repo}`. `DefaultCollection` is a leftover from on-premises TFS, where a collection grouped many projects. Cloud organizations are effectively one collection, so the segment is redundant and is dropped. On-premises Azure DevOps Server hosts and SSH remotes are not supported.

## Building a release

`npm run tauri build` runs `npm run build`, compiles Rust in release mode and produces an installer for the platform it runs on. With `"targets": "all"` that is a `.app` and `.dmg` on macOS and `.msi` and NSIS `.exe` installers on Windows. The built app needs no Node or dev server. Config lives in the Tauri app config dir as `config.json`.

Releases are built by CI on a version tag and installed copies self-update; see [releasing.md](./releasing.md). Windows builds, and Apple code signing and notarization, are not set up yet.

Each machine needs `gh` (and `az` for ADO) installed and logged in. Neither is bundled, by design.

## Platform support

Developed and used on macOS only. Not tested on Windows or Linux.

Portable as-is: the React UI, `classify.ts`, the GitHub and ADO clients, config storage and the link opener.

macOS-specific, most likely to need work for a Windows port:

1. **Binary lookup** (`bin_path` in `lib.rs`): searches only `/opt/homebrew/bin`, `/usr/local/bin` and `/usr/bin`, then falls back to the bare name. This exists because macOS GUI apps don't inherit the shell PATH. Windows GUI apps do, so `gh` may already resolve, but `az` is a `.cmd` script, which Rust's `Command` doesn't launch directly. The lookup should be split per platform with `#[cfg(target_os = ...)]`.
2. **Dock badge**: `set_badge_count` is Dock-oriented and not supported on Windows. A taskbar overlay icon or tray icon would replace it, and the capability in `src-tauri/capabilities/default.json` would change with it.
3. **Build prerequisites**: Windows needs the MSVC build tools and WebView2 (preinstalled on Windows 11).

These Windows notes come from reading the code, not from running it on Windows.
