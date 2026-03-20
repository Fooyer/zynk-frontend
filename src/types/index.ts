// ─── Entidades ──────────────────────────────────

export interface User {
  id: number;
  username: string;
  email?: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away';
  createdAt: string;
}

export interface Channel {
  id: number;
  name: string;
  description: string | null;
  type: 'public' | 'private' | 'dm';
  createdAt: string;
}

export interface Message {
  id: number;
  content: string;
  channelId: number;
  senderId: number;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface ChannelMember {
  id: number;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'status'>;
}

// ─── API Responses ──────────────────────────────

export interface AuthResponse {
  accessToken: string;
  user: Pick<User, 'id' | 'username'>;
}

export interface PaginatedMessages {
  messages: Message[];
  hasMore: boolean;
  nextCursor: number | null;
}

// ─── Socket Events ──────────────────────────────

export interface TypingEvent {
  channelId: number;
  userId: number;
  username: string;
}

export interface UserStatusEvent {
  userId: number;
  username: string;
  status: User['status'];
}

// ─── Electron ───────────────────────────────────

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
    };
  }
}
