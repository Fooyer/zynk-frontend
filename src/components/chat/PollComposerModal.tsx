import { useState } from 'react';
import { usePollStore } from '../../stores/pollStore';
import { alertDialog } from '../../stores/dialogStore';

interface Props {
  channelId: number;
  onClose: () => void;
}

const MAX_OPTIONS = 10;

export function PollComposerModal({ channelId, onClose }: Props) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createPoll = usePollStore((s) => s.createPoll);

  const updateOption = (i: number, value: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? value : o)));
  };

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    setOptions((prev) => [...prev, '']);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!trimmedQuestion || trimmedOptions.length < 2 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createPoll(channelId, trimmedQuestion, trimmedOptions, allowMultiple);
      onClose();
    } catch {
      alertDialog('Erro ao criar a enquete. Tente novamente.', { title: 'Falha ao criar enquete' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const validOptionCount = options.map((o) => o.trim()).filter(Boolean).length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="zk-modal rounded-2xl w-[440px] p-6 max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-100 mb-4">Criar enquete</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Pergunta</label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder="O que você quer perguntar?"
              className="w-full px-3 py-2 zk-input rounded-xl text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Opções</label>
            <div className="flex flex-col gap-2">
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => updateOption(i, e.target.value)}
                    maxLength={120}
                    placeholder={`Opção ${i + 1}`}
                    className="flex-1 px-3 py-2 zk-input rounded-xl text-sm min-w-0"
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(i)}
                      className="p-1.5 rounded-lg text-surface-500 hover:text-danger hover:bg-white/[0.06] transition-colors flex-shrink-0"
                      aria-label="Remover opção"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                onClick={addOption}
                className="mt-2 text-xs font-medium text-accent-400 hover:text-accent-300 transition-colors"
              >
                + Adicionar opção
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowMultiple}
              onChange={(e) => setAllowMultiple(e.target.checked)}
              className="accent-accent-500"
            />
            <span className="text-sm text-surface-300">Permitir múltiplas escolhas</span>
          </label>

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
              disabled={!question.trim() || validOptionCount < 2 || isSubmitting}
              className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
            >
              {isSubmitting ? 'Criando...' : 'Criar enquete'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
