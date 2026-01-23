export interface Headline {
  id: number;
  title: string;
  url: string;
  column: "left" | "right" | "center";
  image_url: string | null;
  created_at: string;
}

export interface MainHeadlineData {
  id: number;
  title: string;
  url: string;
  subtitle: string | null;
  image_url: string | null;
  updated_at: string;
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
