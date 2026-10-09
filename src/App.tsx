import { useCallback, useEffect, useMemo, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listAccounts, type GhAccount } from "./github/accounts";
import { fetchRepos, type RepoResult } from "./github/client";
import type { Bucket, Classified } from "./github/types";
import { classify } from "./state/classify";
import { loadConfig, parseRepo, saveConfig, type Config } from "./store/config";
import "./App.css";

const BUCKETS: { key: Bucket; title: string }[] = [
  { key: "action", title: "Needs your action" },
  { key: "ready", title: "Ready to merge" },
  { key: "waiting", title: "Waiting on others" },
];

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [items, setItems] = useState<Classified[]>([]);
  const [errors, setErrors] = useState<RepoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [showRepos, setShowRepos] = useState(false);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [accounts, setAccounts] = useState<GhAccount[]>([]);

  useEffect(() => {
    loadConfig().then(setConfig);
    listAccounts().then(setAccounts).catch(() => setAccounts([]));
  }, []);

  const refresh = useCallback(async (repos: string[], account: string | null) => {
    if (repos.length === 0) {
      setItems([]);
      setErrors([]);
      return;
    }
    setLoading(true);
    try {
      const { me, results } = await fetchRepos(repos, account);
      const classified = results
        .flatMap((r) => r.prs)
        .map((pr) => classify(pr, me))
        .filter((c): c is Classified => c !== null);
      setItems(classified);
      setErrors(results.filter((r) => r.error));
      setUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  const repoKey = config?.repos.join(",");
  useEffect(() => {
    if (!config) return;
    refresh(config.repos, config.account);
    const id = setInterval(() => refresh(config.repos, config.account), config.pollMinutes * 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoKey, config?.pollMinutes, config?.account, refresh]);

  const update = async (next: Config) => {
    setConfig(next);
    await saveConfig(next);
  };

  const addRepo = async () => {
    const repo = parseRepo(newRepo);
    if (!repo || !config || config.repos.includes(repo)) return;
    setNewRepo("");
    await update({ ...config, repos: [...config.repos, repo] });
  };

  const visible = useMemo(
    () => items.filter((i) => !repoFilter || i.pr.repo === repoFilter),
    [items, repoFilter],
  );

  if (!config) return <main className="app">Loading…</main>;

  return (
    <main className="app">
      <header>
        <h1>PR Radar</h1>
        <select value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
          <option value="">All repos</option>
          {config.repos.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        {accounts.length > 0 && (
          <select
            title="GitHub account"
            value={config.account ?? accounts.find((a) => a.active)?.login ?? ""}
            onChange={(e) => update({ ...config, account: e.target.value })}
          >
            {accounts.map((a) => (
              <option key={a.login} value={a.login}>
                @{a.login}
              </option>
            ))}
          </select>
        )}
        <button onClick={() => refresh(config.repos, config.account)} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
        <button onClick={() => setShowRepos((s) => !s)}>Repos ({config.repos.length})</button>
        {updated && <span className="muted">updated {updated.toLocaleTimeString()}</span>}
      </header>

      {showRepos && (
        <section className="repos">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addRepo();
            }}
          >
            <input
              value={newRepo}
              onChange={(e) => setNewRepo(e.target.value)}
              placeholder="owner/name or GitHub URL"
            />
            <button type="submit">Add</button>
          </form>
          <ul>
            {config.repos.map((r) => (
              <li key={r}>
                {r}
                <button onClick={() => update({ ...config, repos: config.repos.filter((x) => x !== r) })}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {config.repos.length === 0 && <p className="muted">No repos yet. Click “Repos” to add one.</p>}
      {errors.map((e) => (
        <p key={e.repo} className="error">
          {e.repo}: {e.error}
        </p>
      ))}

      {BUCKETS.map(({ key, title }) => {
        const rows = visible
          .filter((i) => i.bucket === key)
          .sort((a, b) => b.pr.updatedAt.localeCompare(a.pr.updatedAt));
        if (rows.length === 0) return null;
        return (
          <section key={key} className={`bucket ${key}`}>
            <h2>
              {title} <span className="count">{rows.length}</span>
            </h2>
            {rows.map(({ pr, role, reason }) => (
              <a key={pr.url} className="pr" href={pr.url} onClick={(e) => (e.preventDefault(), openUrl(pr.url))}>
                <span className="reason">{reason}</span>
                <span className="title">
                  {pr.title} <span className="muted">#{pr.number}</span>
                </span>
                <span className="meta">
                  {pr.repo} · {role} · {pr.author?.login} · {ago(pr.updatedAt)}
                </span>
              </a>
            ))}
          </section>
        );
      })}
    </main>
  );
}
