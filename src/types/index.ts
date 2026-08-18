// ─── Entidades ──────────────────────────────────

export interface User {
  id: number;
  username: string;
  email?: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away' | 'in_call';
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

// ─── Groups ────────────────────────────────────

export type GroupFeature = 'code_tunnel' | 'voice' | 'kanban' | 'notes';

export interface Group {
  id: number;
  name: string;
  avatarUrl: string | null;
  ownerId: number;
  maxMembers: number;
  channelId: number | null;
  features: GroupFeature[];
  owner: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  members: GroupMemberEntry[];
  createdAt: string;
}

export interface GroupMemberEntry {
  id: number;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  user: Pick<User, 'id' | 'username' | 'avatarUrl' | 'status'>;
}

// ─── Group Features ────────────────────────────

export interface GroupNote {
  id: number;
  groupId: number;
  content: string | null;
  updatedBy: number | null;
  editor: Pick<User, 'id' | 'username' | 'avatarUrl'> | null;
  updatedAt: string;
}

export interface KanbanCard {
  id: number;
  groupId: number;
  title: string;
  description: string | null;
  status: 'todo' | 'doing' | 'done';
  creator: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  assignee: Pick<User, 'id' | 'username' | 'avatarUrl'> | null;
  createdAt: string;
}

export interface VoiceParticipant {
  userId: number;
  username: string;
  avatarUrl: string | null;
}

export interface VoiceChannel {
  id: number;
  groupId: number;
  name: string;
  creator: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  participants: VoiceParticipant[];
  position: number;
  createdAt: string;
}

export interface GroupTextChannel {
  id: number;
  name: string;
  groupId: number;
  position: number;
  ownerId: number;
  createdAt: string;
}

// ─── Game Sessions ─────────────────────────────

export interface GameSession {
  id: number;
  groupId: number;
  hostId: number;
  status: 'waiting' | 'active' | 'ended';
  title: string | null;
  maxPlayers: number;
  host: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  participants: GameSessionParticipant[];
  createdAt: string;
}

export interface GameSessionParticipant {
  id: number;
  userId: number;
  role: 'host' | 'player' | 'spectator';
  user: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  joinedAt: string;
}

// ─── Code Sessions ─────────────────────────────

export interface CodeSession {
  id: number;
  groupId: number;
  hostId: number;
  title: string;
  status: 'active' | 'ended';
  host: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  participants: CodeSessionParticipant[];
  files: CodeSessionFileEntry[];
  createdAt: string;
}

export interface CodeSessionParticipant {
  id: number;
  userId: number;
  user: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  joinedAt: string;
}

export interface CodeSessionFileEntry {
  id: number;
  filename: string;
  language: string;
  content: string | null;
  updatedAt: string;
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
      gamepadIsAvailable: () => Promise<boolean>;
      // Multi-gamepad (game sessions)
      gamepadCreateSlot: (slot: number) => Promise<{ success: boolean; error?: string }>;
      gamepadDestroySlot: (slot: number) => Promise<void>;
      gamepadDestroyAllSlots: () => Promise<void>;
      gamepadInputSlot: (slot: number, state: { index: number; timestamp: number; buttons: { pressed: boolean; value: number }[]; axes: number[] }) => void;
      // Filesystem (code sessions)
      fsSelectFolder: () => Promise<string | null>;
      fsReadDir: (dirPath: string) => Promise<Array<{ name: string; isDirectory: boolean; path: string }>>;
      fsReadFile: (filePath: string) => Promise<string | null>;
      fsSaveFile: (filePath: string, content: string) => Promise<boolean>;
      // Code tunnel (VS Code + file watcher)
      tunnelOpenVSCode: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
      tunnelWatchFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
      tunnelStopWatching: () => Promise<void>;
      tunnelWriteRemoteFile: (folderPath: string, relativePath: string, content: string) => Promise<boolean>;
      tunnelDeleteRemoteFile: (folderPath: string, relativePath: string) => Promise<boolean>;
      tunnelOnFileChanged: (callback: (data: { relativePath: string; action: 'change' | 'create' | 'delete'; content: string | null }) => void) => void;
      tunnelOffFileChanged: () => void;
    };
  }
}
