/**
 * Lista de servidores ICE compartilhada por toda chamada de voz/vídeo do app
 * (call 1:1, canais de voz de grupo, game sessions). STUN é só pra descobrir
 * o IP público — não participa da chamada em si. O TURN é usado só quando a
 * conexão direta P2P falha (NAT simétrico/CGNAT); nesses casos o áudio passa
 * a trafegar pelo relay, o que adiciona latência, mas é isso ou a call não
 * conecta.
 *
 * O TURN vem de VITE_TURN_URL/VITE_TURN_USERNAME/VITE_TURN_CREDENTIAL (ver
 * .env.example) — troca de credenciais/servidor sem editar código. Sem essas
 * variáveis, cai no relay1.expressturn.com: um TURN público gratuito, sem
 * conta, sem garantia de capacidade — serve pra desenvolver, não pra
 * depender dele em produção sob carga real.
 */
const TURN_URL = import.meta.env.VITE_TURN_URL || 'turn:relay1.expressturn.com:443';
const TURN_USERNAME = import.meta.env.VITE_TURN_USERNAME || 'public';
const TURN_CREDENTIAL = import.meta.env.VITE_TURN_CREDENTIAL || 'public';

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: TURN_URL,
    username: TURN_USERNAME,
    credential: TURN_CREDENTIAL,
  },
];
