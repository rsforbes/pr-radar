import type { Classified, PullRequest } from "../github/types";

const after = (a: string | null, b: string | null) =>
  a !== null && b !== null && new Date(a).getTime() > new Date(b).getTime();

/** Threads where the last comment is not mine and which are still open. */
function threadsAwaitingMe(pr: PullRequest, me: string, startedByMe: boolean) {
  return pr.threads.filter((t) => {
    if (t.isResolved || t.comments.nodes.length === 0) return false;
    const first = t.comments.nodes[0].author?.login;
    const last = t.comments.nodes[t.comments.nodes.length - 1].author?.login;
    if (last === me) return false;
    return startedByMe ? first === me : true;
  });
}

/**
 * Decide what, if anything, `me` must do on this PR. Returns null when the
 * user is not involved (neither author, requested, nor a past reviewer).
 */
export function classify(pr: PullRequest, me: string): Classified | null {
  if (pr.author?.login === me) return classifyAuthored(pr, me);
  return classifyReviewing(pr, me);
}

function classifyAuthored(pr: PullRequest, me: string): Classified {
  const make = (bucket: Classified["bucket"], reason: string): Classified => ({
    pr,
    role: "author",
    bucket,
    reason,
  });
  if (pr.isDraft) return make("waiting", "Draft");
  if (pr.ciState === "FAILURE" || pr.ciState === "ERROR") return make("action", "CI failing");

  const open = threadsAwaitingMe(pr, me, false);
  if (open.length > 0)
    return make("action", `${open.length} unresolved comment thread${open.length > 1 ? "s" : ""}`);

  const changes = pr.reviews
    .filter((r) => r.state === "CHANGES_REQUESTED" && r.author?.login !== me)
    .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""))
    .at(-1);
  if (pr.reviewDecision === "CHANGES_REQUESTED" && changes && !after(pr.lastCommitAt, changes.submittedAt))
    return make("action", "Changes requested");

  // Anything of mine (comment, review, thread reply, push) counts as having caught up.
  const lastMine =
    [
      ...pr.comments.filter((c) => c.author?.login === me).map((c) => c.createdAt),
      ...pr.reviews.filter((r) => r.author?.login === me).map((r) => r.submittedAt),
      ...pr.threads.flatMap((t) =>
        t.comments.nodes.filter((c) => c.author?.login === me).map((c) => c.createdAt),
      ),
      pr.lastCommitAt,
    ]
      .filter((t): t is string => t !== null)
      .sort()
      .at(-1) ?? null;
  const newComment = pr.comments.some((c) => c.author?.login !== me && after(c.createdAt, lastMine));
  if (newComment) return make("action", "New comment on your PR");

  if (pr.reviewDecision === "APPROVED") return make("ready", "Approved, ready to merge");
  return make("waiting", "Waiting on reviewers");
}

function classifyReviewing(pr: PullRequest, me: string): Classified | null {
  const make = (bucket: Classified["bucket"], reason: string): Classified => ({
    pr,
    role: "reviewer",
    bucket,
    reason,
  });
  if (pr.isDraft) return null;
  const myReviews = pr.reviews.filter((r) => r.author?.login === me && r.submittedAt);
  const myLast = myReviews.map((r) => r.submittedAt as string).sort().at(-1) ?? null;
  const requested = pr.requestedReviewers.includes(me);
  const startedThreads = pr.threads.some((t) => t.comments.nodes[0]?.author?.login === me);

  if (!requested && myReviews.length === 0 && !startedThreads) return null;

  if (requested) return make("action", myLast ? "Re-review requested" : "Review requested");

  // Approving counts as having seen every reply made before it.
  const myApproval =
    myReviews
      .filter((r) => r.state === "APPROVED")
      .map((r) => r.submittedAt as string)
      .sort()
      .at(-1) ?? null;
  const replies = threadsAwaitingMe(pr, me, true).filter((t) => {
    const lastAt = t.comments.nodes[t.comments.nodes.length - 1].createdAt;
    return myApproval === null || after(lastAt, myApproval);
  });
  if (replies.length > 0)
    return make("action", `${replies.length} repl${replies.length > 1 ? "ies" : "y"} to your comments`);

  if (after(pr.lastCommitAt, myLast)) return make("action", "New commits since your review");
  return make("waiting", "Waiting on author");
}
