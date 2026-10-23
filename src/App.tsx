import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listAccounts, type GhAccount } from "./github/accounts";
import { fetchAdoRepos } from "./ado/client";
import { isAdo, fromAdoKey, repoLabel } from "./ado/repo";
import { fetchRepos, type RepoResult } from "./github/client";
import type { Bucket, Classified } from "./github/types";
import { classify } from "./state/classify";
import { loadConfig, parseAnyRepo, saveConfig, type Config } from "./store/config";
import "./App.css";

const BUCKETS: { key: Bucket; title: string }[] = [
  { key: "action", title: "Needs your action" },
  { key: "ready", title: "Ready to merge" },
  { key: "waiting", title: "Waiting on others" },
];

function ago(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

/** Repo name with the owner dimmed so the repo itself stands out. */
function RepoName({ repo }: { repo: string }) {
  const ado = isAdo(repo) ? fromAdoKey(repo) : null;
  const [owner, name] = ado ? [`${ado.org}/${ado.project}`, ado.repo] : repo.split("/");
  return (
    <span className="repo-name">
      <span className="owner">{owner}/</span>
      {name}
    </span>
  );
}

const BUCKET_ORDER: Record<Bucket, number> = { action: 0, ready: 1, waiting: 2 };
const byNumber = (a: Classified, b: Classified) => b.pr.number - a.pr.number;

function PrRow({ item, showRepo }: { item: Classified; showRepo: boolean }) {
  const { pr, role, reason, bucket } = item;
  return (
    <a className={`pr ${bucket}`} href={pr.url} onClick={(e) => (e.preventDefault(), openUrl(pr.url))}>
      <div className="pr-main">
        <span className="title">
          {pr.title} <span className="muted">#{pr.number}</span>
        </span>
        <span className="meta">
          {showRepo && <RepoName repo={pr.repo} />}
          {showRepo && " · "}
          {role === "author" ? "Your PR" : `Reviewing · by ${pr.author?.name ?? pr.author?.login ?? "unknown"}`} · updated {ago(pr.updatedAt)}
        </span>
      </div>
      <span className={`tag ${bucket}`}>{reason}</span>
    </a>
  );
}

/** Split items into [repo, items] groups, keeping first-seen order. */
function groupByRepo(items: Classified[]): [string, Classified[]][] {
  const map = new Map<string, Classified[]>();
  for (const i of items) map.set(i.pr.repo, [...(map.get(i.pr.repo) ?? []), i]);
  return [...map];
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [items, setItems] = useState<Classified[]>([]);
  const [errors, setErrors] = useState<RepoResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [repoFilter, setRepoFilter] = useState("");
  const [newRepo, setNewRepo] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
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
      const [github, ado] = await Promise.all([
        fetchRepos(repos.filter((r) => !isAdo(r)), account),
        fetchAdoRepos(repos.filter(isAdo)),
      ]);
      const results = [...github, ...ado];
      const classified = results
        .flatMap((r) => r.prs.map((pr) => classify(pr, r.me)))
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

  const isCollapsed = (key: string) => config?.collapsed.includes(key) ?? false;
  const toggle = (key: string) => {
    if (!config) return;
    const collapsed = config.collapsed.includes(key)
      ? config.collapsed.filter((k) => k !== key)
      : [...config.collapsed, key];
    update({ ...config, collapsed });
  };
  /** Heading props that make a section title a keyboard-accessible collapse toggle. */
  const toggler = (key: string) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-expanded": !isCollapsed(key),
    onClick: () => toggle(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") (e.preventDefault(), toggle(key));
    },
  });
  const chevron = (key: string) => <span className="chevron">{isCollapsed(key) ? "▸" : "▾"}</span>;

  const addRepo = async () => {
    if (!config) return;
    const repo = parseAnyRepo(newRepo);
    if (!repo) return setAddError("Not a recognised repo. Use owner/name, a github.com URL or an Azure DevOps repo URL.");
    if (config.repos.includes(repo)) return setAddError(`${repo} is already added.`);
    setAddError(null);
    setNewRepo("");
    await update({ ...config, repos: [...config.repos, repo] });
  };

  const visible = useMemo(
    () => items.filter((i) => !repoFilter || i.pr.repo === repoFilter),
    [items, repoFilter],
  );

  // Dock/app-icon badge: PRs needing action across all repos, ignoring the view filter.
  const actionCount = useMemo(() => items.filter((i) => i.bucket === "action").length, [items]);
  useEffect(() => {
    getCurrentWindow()
      .setBadgeCount(actionCount > 0 ? actionCount : undefined)
      .catch(() => {});
  }, [actionCount]);

  if (!config) return <main className="app">Loading…</main>;

  return (
    <main className="app">
      <header>
        <div className="brand">
          <h1>PR Radar</h1>
          {updated && (
            <span className="muted updated">
              Updated {updated.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="controls">
          <select title="Repo filter" value={repoFilter} onChange={(e) => setRepoFilter(e.target.value)}>
            <option value="">All repos</option>
            {config.repos.map((r) => (
              <option key={r} value={r}>
                {repoLabel(r)}
              </option>
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
          <select
            title="Group by"
            value={config.groupBy}
            onChange={(e) => update({ ...config, groupBy: e.target.value as Config["groupBy"] })}
          >
            <option value="status">Group by status</option>
            <option value="repo">Group by repo</option>
          </select>
        </div>
        <div className="actions">
          <button onClick={() => refresh(config.repos, config.account)} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <button onClick={() => setShowRepos((s) => !s)}>Repos ({config.repos.length})</button>
        </div>
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
              onChange={(e) => (setNewRepo(e.target.value), setAddError(null))}
              placeholder="owner/name, GitHub URL or Azure DevOps repo URL"
            />
            <button type="submit">Add</button>
          </form>
          {addError && <p className="error">{addError}</p>}
          <ul>
            {config.repos.map((r) => (
              <li key={r}>
                {repoLabel(r)}
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
          {repoLabel(e.repo)}: {e.error}
        </p>
      ))}

      {config.groupBy === "repo"
        ? groupByRepo([...visible].sort((a, b) => a.pr.repo.localeCompare(b.pr.repo))).map(([repo, rows]) => (
            <section key={repo} className="repo-group">
              <h2 {...toggler(`repo:${repo}`)}>
                {chevron(`repo:${repo}`)}
                <RepoName repo={repo} /> <span className="count">{rows.length}</span>
                {rows.some((r) => r.bucket === "action") && (
                  <span className="count action-count">
                    {rows.filter((r) => r.bucket === "action").length} need action
                  </span>
                )}
              </h2>
              {!isCollapsed(`repo:${repo}`) &&
                [...rows]
                  .sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || byNumber(a, b))
                  .map((item) => <PrRow key={item.pr.url} item={item} showRepo={false} />)}
            </section>
          ))
        : BUCKETS.map(({ key, title }) => {
            const rows = visible.filter((i) => i.bucket === key).sort(byNumber);
            if (rows.length === 0) return null;
            const groups = groupByRepo(rows.sort((a, b) => a.pr.repo.localeCompare(b.pr.repo)));
            return (
              <section key={key} className={`bucket ${key}`}>
                <h2 {...toggler(`status:${key}`)}>
                  {chevron(`status:${key}`)}
                  {title} <span className="count">{rows.length}</span>
                </h2>
                {!isCollapsed(`status:${key}`) &&
                  groups.map(([repo, items]) => {
                    const subKey = `status:${key}/${repo}`;
                    return (
                      <div key={repo} className="repo-sub">
                        {groups.length > 1 && (
                          <h3 {...toggler(subKey)}>
                            {chevron(subKey)}
                            <RepoName repo={repo} /> <span className="count">{items.length}</span>
                          </h3>
                        )}
                        {(groups.length === 1 || !isCollapsed(subKey)) &&
                          items.map((item) => (
                            <PrRow key={item.pr.url} item={item} showRepo={groups.length === 1} />
                          ))}
                      </div>
                    );
                  })}
              </section>
            );
          })}
    </main>
  );
}
