/**
 * Tuning de áudio pra "call de jogo" — objetivo é o menor delay possível,
 * abrindo mão de qualidade/robustez em troca disso. Usado tanto nos canais
 * de voz de grupo (VoiceChannel.mode === 'game') quanto nas chamadas 1:1
 * (CallStore.mode === 'game').
 */

/**
 * getUserMedia sem NS/AGC — cada um desses processamentos do navegador
 * adiciona buffer e portanto delay, e call de jogo abre mão disso pra cortar
 * o delay. echoCancellation FICA DE FORA daqui de propósito: quem joga de
 * caixa de som (sem fone) captava de volta o próprio áudio do jogo/sistema
 * (ticket "Eco do sistema") porque esse modo sempre ia com AEC desligado,
 * sem nenhuma forma de religar. Agora quem monta os constraints (ver
 * getProcessedStream em audioProcessing.ts) aplica `settings.echoCancellation`
 * por cima disso — AEC sozinho não pesa tanto no delay quanto NS/AGC juntos,
 * então dá pra manter ligado (o padrão) mesmo em call de jogo.
 */
export const LOW_LATENCY_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * Prioriza o fluxo de áudio na fila de rede do navegador — reduz o tempo que
 * o pacote fica esperando pra sair, especialmente sob a mesma conexão que
 * outro tráfego (o próprio jogo, por exemplo). Suporte a networkPriority
 * varia por navegador; falha silenciosamente onde não existe.
 */
export async function applyLowLatencySenderParams(sender: RTCRtpSender): Promise<void> {
  try {
    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
    params.encodings[0].priority = 'high';
    (params.encodings[0] as RTCRtpEncodingParameters & { networkPriority?: string }).networkPriority = 'high';
    await sender.setParameters(params);
  } catch {
    // Nem todo navegador suporta os dois campos — não é crítico, só um ganho a mais.
  }
}

/**
 * Reduz o tamanho de frame do Opus (ptime) de 20ms — padrão de conversa — pra
 * 10ms, cortando o delay algorítmico do codec pela metade. Custa mais overhead
 * de pacote (mais cabeçalhos por segundo de áudio), tradeoff aceitável numa
 * call de jogo onde o usuário já tem banda sobrando pro tráfego do próprio jogo.
 */
export function withLowLatencyOpus(sdp: string): string {
  const lines = sdp.split('\r\n');
  const audioIdx = lines.findIndex((l) => l.startsWith('m=audio'));
  if (audioIdx === -1) return sdp;

  // Remove qualquer a=ptime existente na seção de áudio antes de inserir o nosso
  let end = lines.findIndex((l, i) => i > audioIdx && l.startsWith('m='));
  if (end === -1) end = lines.length;
  const filtered = lines.filter((l, i) => !(i > audioIdx && i < end && l.startsWith('a=ptime')));

  const newAudioIdx = filtered.findIndex((l) => l.startsWith('m=audio'));
  filtered.splice(newAudioIdx + 1, 0, 'a=ptime:10');

  return filtered.join('\r\n');
}
