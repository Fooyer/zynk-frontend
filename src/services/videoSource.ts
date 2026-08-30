import { extractYouTubeVideoId } from './youtube';
import type { VideoSource } from '../types';

/**
 * Interpreta o que o usuário colou no modal de "assistir junto": link (ou ID)
 * do YouTube primeiro; se não for, tenta como link direto de vídeo (mp4,
 * webm, ogg, m3u8...) — só aceita http/https, nunca javascript:/file:/data:,
 * que um `<video src>` não executa mas não tem motivo pra aceitar mesmo assim.
 */
export function parseVideoSource(input: string): VideoSource | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const youtubeId = extractYouTubeVideoId(trimmed);
  if (youtubeId) return { type: 'youtube', value: youtubeId };

  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      return { type: 'url', value: trimmed };
    }
  } catch {
    // não é uma URL válida
  }

  return null;
}

/** Extensão `.m3u8` (HLS) precisa de hls.js — `<video>` nativo não decodifica sozinho fora do Safari. */
export function isHlsUrl(value: string): boolean {
  try {
    const { pathname } = new URL(value);
    return pathname.toLowerCase().endsWith('.m3u8');
  } catch {
    return false;
  }
}
