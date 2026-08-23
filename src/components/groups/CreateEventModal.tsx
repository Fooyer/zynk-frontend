import { useEffect, useRef, useState } from 'react';
import { groupsAPI } from '../../services/api';
import { useEventStore } from '../../stores/eventStore';
import { alertDialog } from '../../stores/dialogStore';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import type { GroupTextChannel, VoiceChannel } from '../../types';

interface Props {
  groupId: number;
  onClose: () => void;
}

// Trick padrão pra converter "agora" pro formato que <input type="datetime-local">
// espera (sem timezone), garantindo que o mínimo selecionável seja o momento atual local.
function nowForDatetimeLocal(): string {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function CreateEventModal({ groupId, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [channelValue, setChannelValue] = useState(''); // "text:123" ou "voice:45"
  const [textChannels, setTextChannels] = useState<GroupTextChannel[]>([]);
  const [voiceChannels, setVoiceChannels] = useState<VoiceChannel[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createEvent = useEventStore((s) => s.createEvent);
  const titleRef = useRef<HTMLInputElement>(null);
  const handleTitleContextMenu = useEditableContextMenu(titleRef);

  useEffect(() => {
    groupsAPI.getTextChannels(groupId).then(({ data }) => {
      setTextChannels(data);
      setChannelValue((prev) => prev || (data[0] ? `text:${data[0].id}` : ''));
    });
    groupsAPI.getVoiceChannels(groupId).then(({ data }) => setVoiceChannels(data));
  }, [groupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !channelValue || isSubmitting) return;

    const [channelKind, channelIdStr] = channelValue.split(':') as ['text' | 'voice', string];

    setIsSubmitting(true);
    try {
      await createEvent(groupId, {
        title: title.trim(),
        description: description.trim() || undefined,
        scheduledAt: new Date(date).toISOString(),
        channelKind,
        channelId: Number(channelIdStr),
      });
      onClose();
    } catch (err: any) {
      alertDialog(err.response?.data?.message || 'Erro ao criar evento.', { title: 'Falha ao criar' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="zk-modal rounded-2xl w-[440px] p-6 max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-100 mb-4">Criar evento</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Título</label>
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onContextMenu={handleTitleContextMenu}
              maxLength={100}
              placeholder="Reunião semanal"
              className="w-full px-3 py-2 zk-input rounded-xl text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Do que se trata..."
              className="w-full px-3 py-2 zk-input rounded-xl text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Data e hora</label>
            <input
              type="datetime-local"
              value={date}
              min={nowForDatetimeLocal()}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 zk-input rounded-xl text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Canal do evento</label>
            <select
              value={channelValue}
              onChange={(e) => setChannelValue(e.target.value)}
              className="w-full px-3 py-2 zk-input rounded-xl text-sm"
            >
              {textChannels.length > 0 && (
                <optgroup label="Texto">
                  {textChannels.map((c) => (
                    <option key={`text:${c.id}`} value={`text:${c.id}`}># {c.name}</option>
                  ))}
                </optgroup>
              )}
              {voiceChannels.length > 0 && (
                <optgroup label="Voz">
                  {voiceChannels.map((c) => (
                    <option key={`voice:${c.id}`} value={`voice:${c.id}`}>🔊 {c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <p className="text-[11px] text-surface-500 mt-1">
              É esse canal que determina se alguém já "está dentro" quando a contagem regressiva chegar no fim.
            </p>
          </div>

          <div className="flex gap-3 justify-end mt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !date || !channelValue || isSubmitting}
              className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
            >
              {isSubmitting ? 'Criando...' : 'Criar evento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
