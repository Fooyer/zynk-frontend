// ─── Entidades ──────────────────────────────────

export interface User {
  id: number;
  username: string;
  tag: string;
  email?: string;
  avatarUrl: string | null;
  status: 'online' | 'offline' | 'away' | 'in_call';
  createdAt: string;
}

export interface ReplyTo {
  id: number;
  content: string;
  imageUrl?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  sender: Pick<User, 'id' | 'username' | 'avatarUrl'>;
}

export interface Message {
  id: number;
  content: string;
  imageUrl?: string | null;
  // Anexo genérico (não-imagem) — os quatro campos vêm juntos ou não vêm nenhum.
  fileUrl?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
  fileMimeType?: string | null;
  replyToId?: number | null;
  replyTo?: ReplyTo | null;
  channelId: number;
  senderId: number;
  createdAt: string;
  editedAt?: string | null;
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
  user: Pick<User, 'id' | 'username' | 'tag'>;
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

export type GroupFeature = 'voice' | 'kanban' | 'notes';

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
  /** Vem do servidor (roster), não do WebRTC — por isso funciona mesmo pra
   *  quem não está conectado nessa call. */
  isSharing?: boolean;
  /** Mesma ideia do isSharing — roster, não estado local do peer. */
  isMuted?: boolean;
  /** Compartilhando só áudio do sistema (sem vídeo) — mutuamente exclusivo
   *  com isSharing na UI, mas é um campo de roster independente. */
  isSharingAudio?: boolean;
}

export type CallMode = 'normal' | 'game';

export interface VoiceChannel {
  id: number;
  groupId: number;
  name: string;
  mode: CallMode;
  creator: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  participants: VoiceParticipant[];
  position: number;
  createdAt: string;
}

/** Estado do "assistir junto" (YouTube) de um canal de voz — autoritativo no
 *  servidor, pra quem entra depois já sincronizar sem depender de quem
 *  estava tocando no momento. */
export interface WatchTogetherState {
  videoId: string;
  isPlaying: boolean;
  positionSec: number;
  updatedAtMs: number;
  updatedBy: number;
  /** Próximos vídeos, em ordem — o vídeo atual não está incluído aqui. */
  queue: string[];
}

export interface GroupTextChannel {
  id: number;
  name: string;
  groupId: number;
  position: number;
  ownerId: number;
  createdAt: string;
}

// ─── Polls (enquetes em canais de servidor) ─────

export interface PollOption {
  id: number;
  text: string;
  position: number;
  voteCount: number;
  votedByMe: boolean;
}

export interface Poll {
  id: number;
  channelId: number;
  question: string;
  allowMultiple: boolean;
  closedAt: string | null;
  createdAt: string;
  creator: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  options: PollOption[];
  totalVotes: number;
}

// ─── Events (eventos agendados em servidores) ───
// Tipo se chama ServerEvent (não `Event`) pra não colidir com o Event global do DOM.

export interface ServerEvent {
  id: number;
  groupId: number;
  groupName: string;
  channelKind: 'text' | 'voice';
  channelId: number;
  channelName: string;
  title: string;
  description: string | null;
  scheduledAt: string;
  createdAt: string;
  creator: Pick<User, 'id' | 'username' | 'avatarUrl'>;
  myStatus: 'accepted' | 'declined' | null;
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
      // Auto-update
      getAppVersion: () => Promise<string>;
      checkForUpdates: () => Promise<void>;
      onUpdateChecking: (callback: () => void) => void;
      onUpdateAvailable: (callback: (version: string) => void) => void;
      onUpdateNotAvailable: (callback: () => void) => void;
      onUpdateProgress: (callback: (percent: number) => void) => void;
      onUpdateDownloaded: (callback: (version: string) => void) => void;
      onUpdateError: (callback: (message: string) => void) => void;
      restartToUpdate: () => void;
      // Badge de notificação não lida — taskbar (overlay) e bandeja
      setOverlayBadge: (dataUrl: string | null) => void;
      setTrayBadge: (dataUrl: string | null) => void;
      // Edit commands
      editUndo: () => void;
      editRedo: () => void;
      editCut: () => void;
      editCopy: () => void;
      editPaste: () => void;
      editSelectAll: () => void;
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
      // Atalhos globais (funcionam mesmo com o Zynk em segundo plano, ex.:
      // mutar durante um jogo) — registrados via globalShortcut no main.
      setGlobalShortcuts: (items: { action: string; accelerator: string }[]) => Promise<{ failed: string[] }>;
      onGlobalShortcut: (callback: (action: string) => void) => void;
      offGlobalShortcut: () => void;
    };
  }
}
