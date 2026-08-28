export type Role = "host" | "moderator" | "participant";

export interface Participant {
  userId: string;
  username: string;
  role: Role;
}

export interface PlaybackState {
  videoId: string | null;
  playState: "playing" | "paused";
  currentTime: number;
  lastUpdated: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  timestamp: number;
}
