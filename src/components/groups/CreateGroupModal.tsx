import { useRef, useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import type { GroupFeature } from '../../types';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface FeatureDef {
  id: GroupFeature;
  label: string;
  description: string;
  badge?: string;
  icon: React.ReactNode;
}

// Voz vem sempre ligada por padrão e não pode ser desmarcada — é o core do
// app. Os demais recursos são complementos opcionais, por isso ficam com
// bem menos destaque visual (checkboxes discretos) mais abaixo.
const VOICE_FEATURE: FeatureDef = {
  id: 'voice',
  label: 'Voz',
  description: 'Call direto no grupo, sempre disponível — sem sair pro Discord no meio da sessão.',
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="23" />
      <line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  ),
};

const AVAILABLE_FEATURES: FeatureDef[] = [
  {
    id: 'kanban',
    label: 'Board de Tarefas',
    description: 'Kanban compartilhado dentro do grupo. Sem Trello, sem Jira, sem abrir outra aba.',
    badge: 'Substitui o Trello',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'notes',
    label: 'Notas Compartilhadas',
    description: 'Docs e anotações em markdown que todo mundo edita. Contexto que não se perde.',
    badge: 'Mini Notion',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
];

export function CreateGroupModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState('');
  const [maxMembers, setMaxMembers] = useState(8);
  // Voz vem sempre incluída, por padrão e obrigatoriamente.
  const [features, setFeatures] = useState<GroupFeature[]>(['voice']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createGroup = useGroupStore((s) => s.createGroup);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const nameRef = useRef<HTMLInputElement>(null);
  const handleNameContextMenu = useEditableContextMenu(nameRef);

  if (!isOpen) return null;

  const toggleFeature = (feature: GroupFeature) => {
    if (feature === 'voice') return; // não pode ser desmarcada
    setFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature],
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const group = await createGroup(name.trim(), maxMembers, features);
      setActiveGroup(group.id);
      setName('');
      setFeatures(['voice']);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" onClick={onClose}>
      <div
        className="zk-modal rounded-2xl w-[460px] p-6 max-h-[90vh] overflow-y-auto animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-100 mb-4">Criar Grupo</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Nome do grupo</label>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onContextMenu={handleNameContextMenu}
              maxLength={64}
              placeholder="Meu grupo de amigos"
              className="w-full px-3 py-2 zk-input rounded-xl text-sm"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">
              Max. membros ({maxMembers})
            </label>
            <input
              type="range"
              min={2}
              max={32}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="w-full"
              style={{
                background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${((maxMembers - 2) / (32 - 2)) * 100}%, rgb(var(--color-surface-700)) ${((maxMembers - 2) / (32 - 2)) * 100}%)`,
              }}
            />
          </div>

          {/* Voz — sempre incluída, não dá pra desmarcar */}
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border-2 bg-success/15 border-success">
            <span className="flex-shrink-0 mt-0.5 text-success">{VOICE_FEATURE.icon}</span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold leading-tight text-white">{VOICE_FEATURE.label}</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none bg-success/30 text-success border border-success/40">
                  Sempre incluída
                </span>
              </span>
              <span className="block text-xs mt-1 leading-snug text-success/80">{VOICE_FEATURE.description}</span>
            </span>
            <span className="w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center mt-0.5 bg-success border-success">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="2 6 5 9 10 3" />
              </svg>
            </span>
          </div>

          {/* Extras — opcionais, com bem menos destaque que a voz */}
          <div>
            <label className="block text-[11px] font-medium text-surface-500 uppercase tracking-wide mb-1.5">
              Recursos extras (opcional)
            </label>
            <div className="flex flex-col gap-0.5">
              {AVAILABLE_FEATURES.map((f) => {
                const enabled = features.includes(f.id);
                return (
                  <label
                    key={f.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-white/[0.05] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={() => toggleFeature(f.id)}
                      className="accent-accent-500 flex-shrink-0"
                    />
                    <span className={`flex-shrink-0 ${enabled ? 'text-surface-300' : 'text-surface-600'}`}>
                      {f.icon}
                    </span>
                    <span className="min-w-0">
                      <span className={`text-xs font-medium ${enabled ? 'text-surface-200' : 'text-surface-400'}`}>{f.label}</span>
                      <span className="block text-[11px] text-surface-500 truncate">{f.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex gap-3 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-surface-300 hover:text-surface-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!name.trim() || isSubmitting}
              className="px-4 py-2 zk-btn-primary text-sm rounded-xl"
            >
              {isSubmitting ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
