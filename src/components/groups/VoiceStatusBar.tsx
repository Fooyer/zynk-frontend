import { useState } from 'react';
import { getInitials, getUserColor } from '../../utils/formatDate';
import { useAuthStore } from '../../stores/authStore';
import { ScreenPicker } from '../call/ScreenPicker';
import type { useVoiceRoom } from '../../hooks/useVoiceRoom';
import type { ScreenSource } from '../../types';

interface Props {
  voice: ReturnType<typeof useVoiceRoom>;
}

/**
 * Barra de call de voz — encaixada no rodapé da seção de canais/DMs, sempre
 * colada no fundo. Não navega pra lugar nenhum ao clicar (é só status). Não
 * mostra prévia de tela compartilhada — isso fica só na visão de chamada
 * (aberta clicando no canal de voz conectado).
 */
export function VoiceStatusBar({ voice }: Props) {
  const vc = voice.activeVc;
  const currentUser = useAuthStore((s) => s.user);

  const [showPicker, setShowPicker] = useState(false);

  if (!vc) return null;

  const handleScreenClick = () => {
    if (voice.isScreenSharing) voice.stopScreenShare();
    else setShowPicker(true);
  };

  const handlePickerSelect = (source: ScreenSource) => {
    setShowPicker(false);
    voice.startScreenShare(source.id);
  };

  // Barra de status é só "eu" — a lista com todo mundo da call fica na
  // visão de chamada (aberta clicando no canal de voz conectado).
  const self = vc.participants.find((p) => Number(p.userId) === Number(currentUser?.id)) ?? {
    userId: currentUser?.id ?? 0,
    username: currentUser?.username ?? '',
    avatarUrl: currentUser?.avatarUrl ?? null,
  };

  return (
    <>
      <div className="flex-shrink-0 bg-surface-900 border-t border-surface-700/60 overflow-hidden flex flex-col max-h-[45vh]">
        {/* Header — só status, não navega ao clicar */}
        <div className="px-3 py-2.5 border-b border-surface-700/60 flex items-center gap-2 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full animate-pulse flex-shrink-0 ${vc.mode === 'game' ? 'bg-warning' : 'bg-success'}`} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-surface-100 truncate">{vc.name}</p>
            <p className={`text-[10px] ${vc.mode === 'game' ? 'text-warning' : 'text-success'}`}>Voz conectada</p>
          </div>
        </div>

        {/* Só eu — a lista completa de participantes fica na visão de chamada */}
        <div className="px-3 py-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0"
              style={{ backgroundColor: getUserColor(self.username) }}
            >
              {self.avatarUrl ? (
                <img src={self.avatarUrl} alt="" className="w-full h-full rounded-full object-cover" />
              ) : (
                getInitials(self.username)
              )}
            </div>
            <span className="text-xs text-surface-200 truncate flex-1">{self.username}</span>
            {vc.participants.length > 1 && (
              <span className="text-[10px] text-surface-500 flex-shrink-0">+{vc.participants.length - 1}</span>
            )}
          </div>
        </div>

        {/* Controles */}
        <div className="p-2 border-t border-surface-700/60 flex-shrink-0 flex items-center gap-1">
          <button
            onClick={voice.toggleMute}
            title={voice.isMuted ? 'Ativar microfone' : 'Silenciar'}
            className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center ${
              voice.isMuted ? 'bg-danger/20 text-danger hover:bg-danger/30' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            {voice.isMuted ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>
          <button
            onClick={handleScreenClick}
            title={voice.isScreenSharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
            className={`flex-1 py-2 rounded-lg transition-colors flex items-center justify-center ${
              voice.isScreenSharing ? 'bg-success text-white hover:bg-success-600' : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <polyline points="8 21 12 17 16 21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </button>
          <button
            onClick={voice.leave}
            title="Sair da call"
            className="flex-1 py-2 rounded-lg bg-danger/90 text-white hover:bg-danger transition-colors flex items-center justify-center"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
            </svg>
          </button>
        </div>
      </div>

      {showPicker && <ScreenPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />}
    </>
  );
}
