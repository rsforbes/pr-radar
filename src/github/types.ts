export interface Actor {
  login: string;
}

export interface TimedComment {
  author: Actor | null;
  createdAt: string;
}

export interface ReviewThread {
  isResolved: boolean;
  comments: { nodes: TimedComment[] };
}

export interface Review {
  author: Actor | null;
  state: "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
  submittedAt: string | null;
}

export interface PullRequest {
  repo: string; // owner/name
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
  author: Actor | null;
  updatedAt: string;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  lastCommitAt: string | null;
  ciState: "SUCCESS" | "FAILURE" | "ERROR" | "PENDING" | "EXPECTED" | null;
  requestedReviewers: string[];
  reviews: Review[];
  threads: ReviewThread[];
  comments: TimedComment[];
}

export type Bucket = "action" | "ready" | "waiting";

export interface Classified {
  pr: PullRequest;
  role: "author" | "reviewer";
  bucket: Bucket;
  reason: string;
}
