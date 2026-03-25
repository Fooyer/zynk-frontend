/** Refs compartilhadas para streams de mídia da chamada (não serializáveis no Zustand). */
export const remoteScreenStreamRef: { current: MediaStream | null } = { current: null };
export const localScreenStreamRef: { current: MediaStream | null } = { current: null };

/** AnalyserNodes para detecção de fala (speaking indicators). */
export const localAnalyserRef: { current: AnalyserNode | null } = { current: null };
export const remoteAnalyserRef: { current: AnalyserNode | null } = { current: null };
