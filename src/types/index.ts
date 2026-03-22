// ─── Entidades ──────────────────────────────────

export interface User {
  id: number;
  username: string;
  email?: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away' | 'in_call';
  createdAt: string;
}

export interface Channel {
  id: number;
  name: string;
  description: string | null;
  type: 'public' | 'private' | 'dm';
  createdAt: string;
}

export interface ReplyTo {
  id: number;
  content: string;
  imageUrl?: string | null;
  sender: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface Message {
  id: number;
  content: string;
  imageUrl?: string | null;
  replyToId?: number | null;
  replyTo?: ReplyTo | null;
  channelId: number;
  senderId: number;
  createdAt: string;
  sender: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  isSystem?: boolean;
}

export interface ChannelMember {
  id: number;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'status'>;
}

// ─── DMs ────────────────────────────────────────

export interface DmChannel {
  channelId: number;
  createdAt: string;
  friend: Pick<User, 'id' | 'username' | 'avatarUrl' | 'status'>;
}

// ─── Friends ────────────────────────────────────

export interface FriendEntry {
  id: number;
  status: 'accepted';
  createdAt: string;
  friend: Pick<User, 'id' | 'username' | 'avatarUrl' | 'status'>;
}

export interface FriendRequest {
  id: number;
  status: 'pending';
  createdAt: string;
  requester: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface SentRequest {
  id: number;
  status: 'pending';
  createdAt: string;
  addressee: Pick<User, 'id' | 'username' | 'avatarUrl'>;
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
  status: User['status'] | 'in_call';
}

// ─── Electron ───────────────────────────────────

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
  isScreen: boolean;
}

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      getScreenSources: () => Promise<ScreenSource[]>;
      selectScreenSource: (sourceId: string) => Promise<boolean>;
    };
  }
}
