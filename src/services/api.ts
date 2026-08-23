import axios from "axios";

const API_URL = "https://zynk.fooyer.com";

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.reload();
    }
    return Promise.reject(error);
  },
);

// ─── Auth ───────────────────────────────────────

export const authAPI = {
  register: (data: { username: string; tag: string; email: string; password: string }) =>
    api.post("/auth/register", data),
  login: (data: { email: string; password: string }) =>
    api.post("/auth/login", data),
  me: () => api.get("/users/me"),
};

// ─── Users ────────────────────────────────────────

export const usersAPI = {
  updateMe: (data: { username: string; tag: string }) => api.patch("/users/me", data),
};

// ─── Channels (DMs) ───────────────────────────────

export const channelsAPI = {
  getDmChannels: () => api.get("/channels/dms"),
  openDM: (targetUserId: number) => api.post("/channels/dm", { targetUserId }),
  closeDM: (channelId: number) => api.delete(`/channels/dms/${channelId}`),
};

// ─── Messages ───────────────────────────────────

export const messagesAPI = {
  list: (channelId: number, cursor?: number, limit?: number) =>
    api.get(`/channels/${channelId}/messages`, {
      params: { cursor, limit },
    }),
  // Imagem retorna { imageUrl }; qualquer outro arquivo retorna
  // { fileUrl, fileName, fileSize, fileMimeType } — quem decide é o backend
  // (baseado no mimetype), então o retorno é uma união dos dois formatos.
  uploadFile: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ imageUrl?: string; fileUrl?: string; fileName?: string; fileSize?: number; fileMimeType?: string }>(
      '/messages/upload',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
  },
};

// ─── Polls ──────────────────────────────────────

export const pollsAPI = {
  getByChannel: (channelId: number) => api.get(`/channels/${channelId}/polls`),
  create: (channelId: number, data: { question: string; options: string[]; allowMultiple?: boolean }) =>
    api.post(`/channels/${channelId}/polls`, data),
  vote: (pollId: number, optionId: number) => api.post(`/polls/${pollId}/vote`, { optionId }),
  close: (pollId: number) => api.post(`/polls/${pollId}/close`),
  reopen: (pollId: number) => api.post(`/polls/${pollId}/reopen`),
  remove: (pollId: number) => api.delete(`/polls/${pollId}`),
};

// ─── Friends ────────────────────────────────────

export const friendsAPI = {
  listFriends: () => api.get("/friends"),
  listRequests: () => api.get("/friends/requests"),
  listSent: () => api.get("/friends/sent"),
  sendRequest: (username: string, tag: string) => api.post("/friends/request", { username, tag }),
  sendRequestByUserId: (userId: number) => api.post("/friends/request-by-id", { userId }),
  accept: (id: number) => api.post(`/friends/${id}/accept`),
  reject: (id: number) => api.post(`/friends/${id}/reject`),
  remove: (id: number) => api.delete(`/friends/${id}`),
};

// ─── Groups ────────────────────────────────────

export const groupsAPI = {
  list: () => api.get('/groups'),
  get: (id: number) => api.get(`/groups/${id}`),
  create: (data: { name: string; maxMembers?: number; features?: string[] }) => api.post('/groups', data),
  update: (id: number, name: string) => api.patch(`/groups/${id}`, { name }),
  delete: (id: number) => api.delete(`/groups/${id}`),
  getMembers: (id: number) => api.get(`/groups/${id}/members`),
  invite: (id: number, userId: number) => api.post(`/groups/${id}/invite`, { userId }),
  leave: (id: number) => api.post(`/groups/${id}/leave`),
  removeMember: (id: number, userId: number) => api.delete(`/groups/${id}/members/${userId}`),
  // Notes
  getNote: (id: number) => api.get(`/groups/${id}/notes`),
  updateNote: (id: number, content: string) => api.put(`/groups/${id}/notes`, { content }),
  // Kanban
  getKanban: (id: number) => api.get(`/groups/${id}/kanban`),
  createCard: (id: number, data: { title: string; description?: string }) => api.post(`/groups/${id}/kanban`, data),
  updateCard: (id: number, cardId: number, data: { status?: string; title?: string; description?: string; assigneeId?: number | null }) =>
    api.put(`/groups/${id}/kanban/${cardId}`, data),
  deleteCard: (id: number, cardId: number) => api.delete(`/groups/${id}/kanban/${cardId}`),
  // Voice channels
  getVoiceChannels: (id: number) => api.get(`/groups/${id}/voice-channels`),
  createVoiceChannel: (id: number, name: string, mode?: 'normal' | 'game') =>
    api.post(`/groups/${id}/voice-channels`, { name, mode }),
  renameVoiceChannel: (id: number, vcId: number, name: string) =>
    api.patch(`/groups/${id}/voice-channels/${vcId}`, { name }),
  deleteVoiceChannel: (id: number, vcId: number) => api.delete(`/groups/${id}/voice-channels/${vcId}`),
  // Text channels
  getTextChannels: (id: number) => api.get(`/groups/${id}/text-channels`),
  createTextChannel: (id: number, name: string) =>
    api.post(`/groups/${id}/text-channels`, { name }),
  renameTextChannel: (id: number, channelId: number, name: string) =>
    api.patch(`/groups/${id}/text-channels/${channelId}`, { name }),
  deleteTextChannel: (id: number, channelId: number) =>
    api.delete(`/groups/${id}/text-channels/${channelId}`),
  // Ordem dos canais (drag-and-drop)
  reorderChannels: (id: number, items: { id: number; type: 'text' | 'voice' }[]) =>
    api.put(`/groups/${id}/channel-order`, { items }),
};

// ─── Events ─────────────────────────────────────

export const eventsAPI = {
  mine: () => api.get('/events/mine'),
  create: (groupId: number, data: { title: string; description?: string; scheduledAt: string; channelKind: 'text' | 'voice'; channelId: number }) =>
    api.post(`/groups/${groupId}/events`, data),
  respond: (eventId: number, status: 'accepted' | 'declined') => api.post(`/events/${eventId}/respond`, { status }),
  remove: (eventId: number) => api.delete(`/events/${eventId}`),
};

// ─── Game Sessions ─────────────────────────────

export const gameSessionsAPI = {
  create: (data: { groupId: number; title?: string; maxPlayers?: number }) =>
    api.post('/game-sessions', data),
  get: (id: number) => api.get(`/game-sessions/${id}`),
  join: (id: number) => api.post(`/game-sessions/${id}/join`),
  leave: (id: number) => api.post(`/game-sessions/${id}/leave`),
  end: (id: number) => api.post(`/game-sessions/${id}/end`),
  getActive: (groupId: number) => api.get(`/game-sessions/group/${groupId}/active`),
};

export default api;
