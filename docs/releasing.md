# Releasing

Releases are built by `.github/workflows/release.yml` when a `v*` tag is pushed, and published as GitHub Releases. Installed copies check the latest release for updates at startup (`src/update.ts`) and show an "Update and restart" banner.

## One-time setup

1. **Generate the update signing key** (this is separate from OS code signing; the updater uses it to verify downloads):
   ```sh
   npm run tauri signer generate -- -w ~/.tauri/pr-radar.key
   ```
   Keep the private key (`pr-radar.key`) and its password out of the repo.
2. Put the **public** key (the contents of `~/.tauri/pr-radar.key.pub`) in `src-tauri/tauri.conf.json` as `plugins.updater.pubkey`.
3. In the GitHub repo settings, add the secrets `TAURI_SIGNING_PRIVATE_KEY` (the contents of the private key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if you set a password).
4. The repo must be **public**: installed apps fetch `latest.json` and the installers over plain HTTPS with no login.

If the private key is lost, installed copies can no longer verify updates and everyone has to reinstall by hand.

## Cutting a release

1. Bump `version` in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json` (keep them equal; the updater compares against `tauri.conf.json`).
2. Commit, then tag and push:
   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```
3. The workflow runs the tests, builds macOS (Apple Silicon and Intel) installers and uploads them with `latest.json` to the release.

## Installing

- Download the `.dmg` from the Releases page and drag the app to Applications.
- Builds aren't Apple-signed or notarized, so the first launch shows a Gatekeeper warning. Right-click the app, choose Open, and confirm. (Or run `xattr -cr /Applications/pr-radar.app` once.) Later updates installed by the app itself should not prompt again.
- Each machine still needs `gh` (and `az` for Azure DevOps) installed and logged in.

## Not set up yet

- Windows builds (the app needs its Windows port first; see `docs/architecture.md`). The matrix has a commented-out Windows entry.
- Apple code signing and notarization (needs a paid Apple Developer account).
