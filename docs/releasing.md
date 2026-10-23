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
- Apple code signing and notarization (steps below).

## Apple signing and notarization (to do)

Without this, a fresh browser download shows "pr-radar is damaged and can't be opened". The workaround is `xattr -cr /Applications/pr-radar.app`. Signing and notarizing removes the need for it. Requires a paid Apple Developer account (the Account Holder role is needed to create the certificate).

1. **Create a Developer ID Application certificate.** The Apple Development and Apple Distribution certificates do not work: they are for running on your own devices and for the App Store. In Xcode: Settings, Accounts, select the team, Manage Certificates, **+**, Developer ID Application. Or create it at developer.apple.com under Certificates.
2. **Export it** from Keychain Access (right-click, Export) as a `.p12` with a password.
3. **Encode it:** `base64 -i cert.p12 | pbcopy`
4. **Create an app-specific password** at appleid.apple.com (Sign-In and Security, App-Specific Passwords). Notarization uses this, not the Apple ID password.
5. **Add GitHub secrets** (Settings, Secrets and variables, Actions):
   - `APPLE_CERTIFICATE`: the base64 text from step 3
   - `APPLE_CERTIFICATE_PASSWORD`: the `.p12` password
   - `APPLE_SIGNING_IDENTITY`: the full certificate name, e.g. `Developer ID Application: Your Name (TEAMID)`. List it with `security find-identity -v -p codesigning`.
   - `APPLE_ID`: the Apple ID email
   - `APPLE_PASSWORD`: the app-specific password
   - `APPLE_TEAM_ID`: the 10-character Team ID
6. **Pass them to the build:** add the six variables to the `env:` block of the `tauri-apps/tauri-action` step in `.github/workflows/release.yml`, each as `${{ secrets.NAME }}`. Add them only after the secrets exist, since empty values can make the build fail. `tauri-action` then imports the certificate, signs the app and submits it for notarization.
7. Tag a new version and check the build log for the notarization step. Notarization adds a few minutes. Then download the `.dmg` and confirm it opens without the `xattr` workaround.

The update signing key is separate and unaffected: updates keep verifying with `TAURI_SIGNING_PRIVATE_KEY`.
