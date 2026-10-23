import { invoke } from "@tauri-apps/api/core";
import { parseAdoRepo } from "../ado/repo";
import type { Bucket } from "../github/types";

export interface Config {
  repos: string[]; // "owner/name" (GitHub) or "ado:org/project/repo" (Azure DevOps)
  pollMinutes: number;
  tab: Bucket; // selected status tab
  collapsed: string[]; // collapsed repo sub-group keys, e.g. "status:action/owner/name"
  account: string | null; // gh login to use; null = gh's active account
}

const DEFAULT: Config = { repos: [], pollMinutes: 5, tab: "action", collapsed: [], account: null };

export async function loadConfig(): Promise<Config> {
  const raw = await invoke<string>("load_config");
  if (!raw) return DEFAULT;
  try {
    const { groupBy: _legacy, ...saved } = JSON.parse(raw); // groupBy was replaced by tabs
    return { ...DEFAULT, ...saved };
  } catch {
    return DEFAULT;
  }
}

export async function saveConfig(config: Config): Promise<void> {
  await invoke("save_config", { json: JSON.stringify(config, null, 2) });
}

/** Accepts "owner/name" or a github.com URL; returns "owner/name" or null. */
export function parseRepo(input: string): string | null {
  const m = input.trim().match(/^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

/** Accepts anything parseRepo or parseAdoRepo does; returns the repo key or null. */
export const parseAnyRepo = (input: string): string | null => parseAdoRepo(input) ?? parseRepo(input);
