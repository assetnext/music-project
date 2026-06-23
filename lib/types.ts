export type Room = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  host_name: string;
};

export type Track = {
  id: string;
  room_id: string;
  title: string;
  artist: string | null;
  file_path: string;
  duration: number | null;
  uploaded_by: string;
  created_at: string;
  position: number;
};

export type PlaybackState = {
  room_id: string;
  current_track_id: string | null;
  is_playing: boolean;
  position_seconds: number;
  updated_at: string;
  updated_by: string;
};

export type ChatMessage = {
  id: string;
  room_id: string;
  author_name: string;
  body: string;
  created_at: string;
  // Campos opcionales para reply (añadidos en la migración)
  reply_to_id?: string | null;
  reply_to_author?: string | null;
  reply_to_body?: string | null;
};

export type PresenceUser = {
  name: string;
  color: string;
  online_at: string;
};

export const AVATAR_COLORS = [
  '#9bff6e',
  '#ffb454',
  '#6ec5ff',
  '#ff6ec5',
  '#ffe96e',
  '#c56eff',
];

export function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
