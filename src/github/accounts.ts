import { invoke } from "@tauri-apps/api/core";

export interface GhAccount {
  login: string;
  active: boolean;
}

/** Logged-in github.com accounts known to the `gh` CLI. */
export async function listAccounts(): Promise<GhAccount[]> {
  const raw = await invoke<string>("gh_accounts");
  const hosts = JSON.parse(raw).hosts ?? {};
  return (hosts["github.com"] ?? []).map((a: { login: string; active: boolean }) => ({
    login: a.login,
    active: a.active,
  }));
}
