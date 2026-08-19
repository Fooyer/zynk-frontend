/**
 * Lista de servidores ICE compartilhada por toda chamada de voz/vídeo do app
 * (call 1:1, canais de voz de grupo, game sessions). STUN é só pra descobrir
 * o IP público — não participa da chamada em si. O TURN é usado só quando a
 * conexão direta P2P falha (NAT simétrico/CGNAT); nesses casos o áudio passa
 * a trafegar pelo relay, o que adiciona latência, mas é isso ou a call não
 * conecta. relay1.expressturn.com é um TURN público gratuito (sem custo,
 * sem conta) — trocar por um coturn próprio se a demanda crescer.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:relay1.expressturn.com:443',
    username: 'public',
    credential: 'public',
  },
];
