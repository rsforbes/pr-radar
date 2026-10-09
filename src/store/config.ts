import { invoke } from "@tauri-apps/api/core";

export interface Config {
  repos: string[]; // "owner/name"
  pollMinutes: number;
}

const DEFAULT: Config = { repos: [], pollMinutes: 5 };

export async function loadConfig(): Promise<Config> {
  const raw = await invoke<string>("load_config");
  if (!raw) return DEFAULT;
  try {
    return { ...DEFAULT, ...JSON.parse(raw) };
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
