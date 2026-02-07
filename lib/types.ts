export interface Headline {
  id: number;
  title: string;
  url: string;
  column: "left" | "right" | "center";
  image_url: string | null;
  token_id: number | null;
  created_at: string;
  // Joined token data (optional)
  token?: TokenInfo;
}

export interface TokenInfo {
  ticker: string;
  pump_url: string;
  price_change_24h?: number;
}

export interface MainHeadlineData {
  id: number;
  title: string;
  url: string;
  subtitle: string | null;
  image_url: string | null;
  updated_at: string;
}

export interface CoinOfTheDayData {
  id: number;
  title: string;
  url: string;
  description: string | null;
  image_url: string | null;
  updated_at: string;
}

export interface SetCoinOfTheDayRequest {
  title: string;
  url: string;
  description?: string;
  image_url?: string;
}

export interface WhitelistUser {
  telegram_id: string;
  username: string | null;
  added_at: string;
}

export interface AddHeadlineRequest {
  title: string;
  url: string;
  column?: "left" | "right";
  image_url?: string;
}

export interface SetMainHeadlineRequest {
  title: string;
  url: string;
  subtitle?: string;
  image_url?: string;
}

// ============= SUBMISSION TYPES =============

export type ContentType = "article" | "tweet" | "youtube" | "tiktok" | "other";
export type SubmissionStatus = "pending" | "validating" | "approved" | "rejected" | "published";

export interface Submission {
  id: number;
  telegram_user_id: string;
  telegram_username: string | null;
  sol_address: string;
  url: string;
  content_type: ContentType;
  status: SubmissionStatus;
  rejection_reason: string | null;
  content_hash: string | null;
  embedding: string | null; // JSON stringified array for semantic search
  cached_content: string | null; // JSON stringified PageContent from validation
  published_at: string | null;
  created_at: string;
}

export interface CreateSubmissionRequest {
  telegram_user_id: string;
  telegram_username?: string;
  sol_address: string;
  url: string;
  content_type?: ContentType;
}

// ============= TOKEN TYPES =============

export interface Token {
  id: number;
  headline_id: number | null;
  submission_id: number | null;
  token_name: string;
  ticker: string;
  image_url: string | null;
  mint_address: string | null;
  pump_url: string | null;
  deployer_sol_address: string;
  created_at: string;
}

export interface CreateTokenRequest {
  headline_id?: number;
  submission_id?: number;
  token_name: string;
  ticker: string;
  image_url?: string;
  mint_address?: string;
  pump_url?: string;
  deployer_sol_address: string;
}

// ============= REVENUE TYPES =============

export type RevenueStatus = "pending" | "submitter_paid" | "burned" | "completed" | "failed";

export interface RevenueEvent {
  id: number;
  token_id: number;
  amount_lamports: number;
  submitter_share_lamports: number;
  burn_share_lamports: number;
  submitter_tx_signature: string | null;
  burn_tx_signature: string | null;
  status: RevenueStatus;
  created_at: string;
}

export interface CreateRevenueEventRequest {
  token_id: number;
  amount_lamports: number;
}

// ============= VALIDATION TYPES =============

export interface ValidationResult {
  isValid: boolean;
  factScore: number;       // 0-100
  freshnessHours: number;  // Age in hours
  duplicateOf?: number;    // submission_id if duplicate
  rejectionReason?: string;
}

export interface PageContent {
  title: string;
  description: string;
  content: string;
  imageUrl: string | null;
  publishedAt?: Date;
}

// ============= TOKEN GENERATION TYPES =============

export interface TokenMetadata {
  name: string;
  ticker: string;
  imageUrl: string;
}

// ============= STATE MACHINE =============

/** Valid status transitions – enforced by db.updateSubmissionStatus */
export const VALID_STATUS_TRANSITIONS: Record<SubmissionStatus, SubmissionStatus[]> = {
  pending: ["validating", "rejected"],
  validating: ["approved", "rejected"],
  approved: ["published", "rejected"],
  rejected: [],   // Terminal state
  published: [],  // Terminal state
};
