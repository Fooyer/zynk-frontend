import axios from "axios";

const API_URL = "https://zynk.fooyer.space";

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
  register: (data: { username: string; email: string; password: string }) =>
    api.post("/auth/register", data),
  login: (data: { username: string; password: string }) =>
    api.post("/auth/login", data),
  me: () => api.get("/users/me"),
};

// ─── Channels ───────────────────────────────────

export const channelsAPI = {
  list: () => api.get("/channels"),
  discover: () => api.get("/channels/discover"),
  create: (data: { name: string; description?: string; type?: string }) =>
    api.post("/channels", data),
  join: (channelId: number) => api.post(`/channels/${channelId}/join`),
  members: (channelId: number) => api.get(`/channels/${channelId}/members`),
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
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('image', file);
    return api.post<{ imageUrl: string }>('/messages/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ─── Friends ────────────────────────────────────

export const friendsAPI = {
  listFriends: () => api.get("/friends"),
  listRequests: () => api.get("/friends/requests"),
  listSent: () => api.get("/friends/sent"),
  sendRequest: (username: string) => api.post("/friends/request", { username }),
  accept: (id: number) => api.post(`/friends/${id}/accept`),
  reject: (id: number) => api.post(`/friends/${id}/reject`),
  remove: (id: number) => api.delete(`/friends/${id}`),
};

// ─── Groups ────────────────────────────────────

export const groupsAPI = {
  list: () => api.get('/groups'),
  get: (id: number) => api.get(`/groups/${id}`),
  create: (data: { name: string; maxMembers?: number }) => api.post('/groups', data),
  getMembers: (id: number) => api.get(`/groups/${id}/members`),
  invite: (id: number, userId: number) => api.post(`/groups/${id}/invite`, { userId }),
  leave: (id: number) => api.post(`/groups/${id}/leave`),
  removeMember: (id: number, userId: number) => api.delete(`/groups/${id}/members/${userId}`),
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

// ─── Code Sessions ─────────────────────────────

export const codeSessionsAPI = {
  create: (data: { groupId: number; title: string }) => api.post('/code-sessions', data),
  get: (id: number) => api.get(`/code-sessions/${id}`),
  join: (id: number) => api.post(`/code-sessions/${id}/join`),
  leave: (id: number) => api.post(`/code-sessions/${id}/leave`),
  end: (id: number) => api.post(`/code-sessions/${id}/end`),
  getFiles: (id: number) => api.get(`/code-sessions/${id}/files`),
  saveFile: (id: number, data: { filename: string; language?: string; content: string }) =>
    api.put(`/code-sessions/${id}/files`, data),
  getActive: (groupId: number) => api.get(`/code-sessions/group/${groupId}/active`),
};

export default api;
