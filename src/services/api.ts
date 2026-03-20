import axios from "axios";

const API_URL = "https://zynk.fooyer.space";

/**
 * Instância Axios configurada.
 * Interceptor adiciona o token JWT automaticamente.
 */
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

// Interceptor: injeta token em toda request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Interceptor: trata 401 (token expirado)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      window.location.reload(); // Força volta pro login
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
};

// ─── Messages ───────────────────────────────────

export const messagesAPI = {
  list: (channelId: number, cursor?: number, limit?: number) =>
    api.get(`/channels/${channelId}/messages`, {
      params: { cursor, limit },
    }),
};

export default api;
