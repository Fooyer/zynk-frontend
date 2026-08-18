import { io, Socket } from "socket.io-client";

const SOCKET_URL = "https://zynk.fooyer.com/chat";

let socket: Socket | null = null;

/**
 * Retorna a instância do socket (singleton).
 * Conecta automaticamente com o token JWT.
 *
 * Decisão: singleton para evitar múltiplas conexões.
 * Em caso de horizontal scaling, Redis adapter no backend
 * garante que mensagens chegam em qualquer instância.
 */
export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token");

    socket = io(SOCKET_URL, {
      auth: { token },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      transports: ["websocket"], // Prefere WS direto, sem polling
    });
  }
  return socket;
}

/**
 * Conecta o socket. Chamar após login.
 */
export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

/**
 * Desconecta e limpa. Chamar no logout.
 */
export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
