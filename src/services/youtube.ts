// Carrega a IFrame Player API do YouTube sob demanda — só quando alguém
// abre o "assistir junto" pela primeira vez, não no boot do app.
let apiPromise: Promise<void> | null = null;

export function loadYouTubeIframeAPI(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }

    // A API global chama isso quando termina de carregar — encadeia com
    // qualquer callback que outra parte do app já tenha registrado (não deve
    // acontecer hoje, mas evita pisar num handler futuro).
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    // Sem isso, uma falha de rede/CSP/DNS ao carregar o script deixava essa
    // promise pendurada pra sempre — sem erro, sem timeout, e o player ficava
    // eternamente em "Carregando..." sem nenhuma pista do que deu errado.
    tag.onerror = () => {
      apiPromise = null;
      reject(new Error('Falha ao carregar o script da IFrame Player API do YouTube.'));
    };
    document.head.appendChild(tag);

    setTimeout(() => {
      if (!window.YT?.Player) {
        apiPromise = null;
        reject(new Error('Timeout esperando a IFrame Player API do YouTube carregar.'));
      }
    }, 15_000);
  });

  return apiPromise;
}

// Aceita link completo (watch?v=, youtu.be/, shorts/, embed/) ou o próprio
// ID de 11 caracteres colado direto.
export function extractYouTubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (url.hostname.endsWith('youtube.com')) {
      if (url.pathname === '/watch') {
        const id = url.searchParams.get('v');
        return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
      }
      const match = url.pathname.match(/^\/(shorts|embed|live)\/([a-zA-Z0-9_-]{11})/);
      if (match) return match[2];
    }
  } catch {
    // não é uma URL válida
  }
  return null;
}

// Tipagem mínima (ambiente — sem implementação) da IFrame Player API do
// YouTube, só o que este app usa. O script carregado em runtime por
// loadYouTubeIframeAPI() é quem de fato popula window.YT.
export declare namespace YT {
  enum PlayerState {
    UNSTARTED = -1,
    ENDED = 0,
    PLAYING = 1,
    PAUSED = 2,
    BUFFERING = 3,
    CUED = 5,
  }

  interface OnStateChangeEvent {
    data: PlayerState;
  }

  interface PlayerOptions {
    videoId?: string;
    width?: string | number;
    height?: string | number;
    playerVars?: Record<string, string | number>;
    events?: {
      onReady?: (event: { target: Player }) => void;
      onStateChange?: (event: OnStateChangeEvent) => void;
    };
  }

  class Player {
    constructor(elementId: string | HTMLElement, options: PlayerOptions);
    playVideo(): void;
    pauseVideo(): void;
    seekTo(seconds: number, allowSeekAhead: boolean): void;
    loadVideoById(videoId: string): void;
    getCurrentTime(): number;
    getDuration(): number;
    getPlayerState(): PlayerState;
    setVolume(volume: number): void;
    getVolume(): number;
    mute(): void;
    unMute(): void;
    isMuted(): boolean;
    destroy(): void;
  }
}

declare global {
  interface Window {
    YT?: typeof YT;
    onYouTubeIframeAPIReady?: () => void;
  }
}
