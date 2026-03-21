/** Refs compartilhadas para streams de mídia da chamada (não serializáveis no Zustand). */
export const remoteScreenStreamRef: { current: MediaStream | null } = { current: null };
export const localScreenStreamRef: { current: MediaStream | null } = { current: null };
