import { describe, expect, it } from "vitest";
import { classify } from "../state/classify";
import { ciFromStatuses, mapPr, type AdoPr, type AdoThread } from "./client";
import { fromAdoKey, parseAdoRepo } from "./repo";

describe("parseAdoRepo", () => {
  it("parses dev.azure.com URLs", () => {
    expect(parseAdoRepo("https://dev.azure.com/acme/Web/_git/site")).toBe("ado:acme/Web/site");
  });
  it("ignores user prefix, trailing path and encoding", () => {
    expect(parseAdoRepo("https://acme@dev.azure.com/acme/My%20Proj/_git/site/pullrequests")).toBe(
      "ado:acme/My Proj/site",
    );
  });
  it("parses legacy visualstudio.com URLs", () => {
    expect(parseAdoRepo("https://acme.visualstudio.com/Web/_git/site")).toBe("ado:acme/Web/site");
  });
  it("uses the repo name as project when the URL has none", () => {
    expect(parseAdoRepo("https://dev.azure.com/acme/_git/site")).toBe("ado:acme/site/site");
  });
  it("round-trips stored keys and rejects other input", () => {
    expect(fromAdoKey("ado:acme/Web/site")).toEqual({ org: "acme", project: "Web", repo: "site" });
    expect(parseAdoRepo("ado:acme/Web")).toBeNull();
    expect(parseAdoRepo("https://github.com/a/b")).toBeNull();
    expect(parseAdoRepo("a/b")).toBeNull();
  });
});

const repo = { org: "acme", project: "Web", repo: "site" };
const KEY = "ado:acme/Web/site";
const me = { id: "me", displayName: "Me" };
const them = { id: "them", displayName: "Them" };
const rawPr = (over: Partial<AdoPr> = {}): AdoPr => ({
  pullRequestId: 7,
  title: "T",
  creationDate: "2026-01-01T00:00:00Z",
  createdBy: them,
  reviewers: [{ ...me, vote: 0 }],
  repository: { project: { id: "pid" } },
  ...over,
});
const thread = (status: string, ...by: [typeof me, string][]): AdoThread => ({
  status,
  threadContext: {},
  comments: by.map(([author, publishedDate]) => ({ author, publishedDate, commentType: "text" })),
});
const voteThread = (who: typeof me, vote: number, at: string): AdoThread => ({
  properties: { CodeReviewThreadType: { $value: "VoteUpdate" }, CodeReviewVoteResult: { $value: String(vote) } },
  comments: [{ author: who, publishedDate: at, commentType: "system" }],
});
const iter = (d: string) => ({ createdDate: d });

describe("mapPr + classify", () => {
  it("asks for a review when I am an unvoted reviewer", () => {
    const pr = mapPr(repo, KEY, rawPr(), [], [iter("2026-01-01T00:00:00Z")], null);
    expect(pr.url).toBe("https://dev.azure.com/acme/Web/_git/site/pullrequest/7");
    expect(classify(pr, "me")?.reason).toBe("Review requested");
  });
  it("is not involved when I am not a reviewer", () => {
    const pr = mapPr(repo, KEY, rawPr({ reviewers: [] }), [], [], null);
    expect(classify(pr, "me")).toBeNull();
  });
  it("flags an author's open thread and ignores system threads", () => {
    const pr = mapPr(
      repo,
      KEY,
      rawPr({ createdBy: me }),
      [thread("active", [them, "2026-01-02T00:00:00Z"]), voteThread(them, 10, "2026-01-02T00:00:00Z")],
      [],
      null,
    );
    expect(classify(pr, "me")?.reason).toBe("1 unresolved comment thread");
  });
  it("treats resolved threads as done and approvals as ready", () => {
    const pr = mapPr(
      repo,
      KEY,
      rawPr({ createdBy: me, reviewers: [{ ...them, vote: 10 }] }),
      [thread("fixed", [them, "2026-01-02T00:00:00Z"])],
      [],
      "SUCCESS",
    );
    expect(classify(pr, "me")?.bucket).toBe("ready");
  });
  it("dates a rejection from its vote thread so a later push clears it", () => {
    const reviewers = [{ ...them, vote: -10 }];
    const votes = [voteThread(them, -10, "2026-01-02T00:00:00Z")];
    const pushed = mapPr(repo, KEY, rawPr({ createdBy: me, reviewers }), votes, [iter("2026-01-03T00:00:00Z")], null);
    expect(classify(pushed, "me")?.bucket).toBe("waiting");
    const stale = mapPr(repo, KEY, rawPr({ createdBy: me, reviewers }), votes, [iter("2026-01-01T00:00:00Z")], null);
    expect(classify(stale, "me")?.reason).toBe("Changes requested");
  });
  it("flags CI failure on my PR", () => {
    const pr = mapPr(repo, KEY, rawPr({ createdBy: me }), [], [], ciFromStatuses(["succeeded", "failed"]));
    expect(classify(pr, "me")?.reason).toBe("CI failing");
  });
});
