import { useState } from 'react';
import { useGroupStore } from '../../stores/groupStore';
import type { GroupFeature } from '../../types';

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

const AVAILABLE_FEATURES: FeatureDef[] = [
  {
    id: 'code_tunnel',
    label: 'Code Tunnel',
    description: 'Sync de arquivos em tempo real. Abre no VS Code de cada um automaticamente.',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </svg>
    ),
  },
  {
    id: 'voice',
    label: 'Voz',
    description: 'Call direto no grupo, sem sair pro Discord no meio da sessão.',
    badge: 'Elimina o Discord',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
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
  const [features, setFeatures] = useState<GroupFeature[]>(['code_tunnel']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createGroup = useGroupStore((s) => s.createGroup);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);

  if (!isOpen) return null;

  const toggleFeature = (feature: GroupFeature) => {
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
      setFeatures(['code_tunnel']);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-800 rounded-xl w-[460px] p-6 border border-surface-700 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-surface-100 mb-4">Criar Grupo</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Nome do grupo</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={64}
              placeholder="Meu grupo de amigos"
              className="w-full px-3 py-2 bg-surface-900 border border-surface-700 rounded-lg text-surface-100 text-sm placeholder-surface-500 focus:outline-none focus:border-accent-500"
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
              max={10}
              value={maxMembers}
              onChange={(e) => setMaxMembers(Number(e.target.value))}
              className="w-full accent-accent-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-surface-100">Recursos</label>
              <span className="text-xs text-surface-500">{features.length} selecionado{features.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex flex-col gap-2">
              {AVAILABLE_FEATURES.map((f) => {
                const enabled = features.includes(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFeature(f.id)}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all ${
                      enabled
                        ? 'bg-accent-600/25 border-accent-400 shadow-sm shadow-accent-500/20'
                        : 'bg-surface-900 border-surface-600 hover:border-surface-500'
                    }`}
                  >
                    <span className={`flex-shrink-0 mt-0.5 ${enabled ? 'text-accent-300' : 'text-surface-500'}`}>
                      {f.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm font-semibold leading-tight ${enabled ? 'text-white' : 'text-surface-200'}`}>
                          {f.label}
                        </span>
                        {f.badge && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full leading-none ${
                            enabled
                              ? 'bg-accent-500/30 text-accent-200 border border-accent-400/40'
                              : 'bg-surface-700 text-surface-400 border border-surface-600'
                          }`}>
                            {f.badge}
                          </span>
                        )}
                      </span>
                      <span className={`block text-xs mt-1 leading-snug ${enabled ? 'text-accent-200/80' : 'text-surface-500'}`}>
                        {f.description}
                      </span>
                    </span>
                    <span
                      className={`w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center mt-0.5 transition-all ${
                        enabled ? 'bg-accent-500 border-accent-400' : 'border-surface-500 bg-surface-800'
                      }`}
                    >
                      {enabled && (
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="2 6 5 9 10 3" />
                        </svg>
                      )}
                    </span>
                  </button>
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
              className="px-4 py-2 bg-accent-600 hover:bg-accent-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Criando...' : 'Criar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
