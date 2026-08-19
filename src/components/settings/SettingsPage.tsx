import { useEffect, useState, useCallback } from 'react';
import { useSettingsStore, type NoiseSuppression } from '../../stores/settingsStore';
import { useUiStore } from '../../stores/uiStore';
import { useAuthStore } from '../../stores/authStore';

interface DeviceInfo {
  deviceId: string;
  label: string;
}

function useMediaDevices() {
  const [inputs, setInputs] = useState<DeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<DeviceInfo[]>([]);

  const refresh = useCallback(async () => {
    try {
      // Precisa de permissão para listar labels
      await navigator.mediaDevices.getUserMedia({ audio: true }).then((s) =>
        s.getTracks().forEach((t) => t.stop()),
      );
      const devices = await navigator.mediaDevices.enumerateDevices();
      setInputs(
        devices
          .filter((d) => d.kind === 'audioinput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Microfone (${d.deviceId.slice(0, 6)})` })),
      );
      setOutputs(
        devices
          .filter((d) => d.kind === 'audiooutput')
          .map((d) => ({ deviceId: d.deviceId, label: d.label || `Alto-falante (${d.deviceId.slice(0, 6)})` })),
      );
    } catch {
      // Sem permissão
    }
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refresh);
  }, [refresh]);

  return { inputs, outputs, refresh };
}

function MicTest({ deviceId }: { deviceId: string }) {
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!testing) return;

    let animId: number;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: deviceId ? { deviceId: { exact: deviceId } } : true,
        });
        ctx = new AudioContext();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const data = new Float32Array(analyser.fftSize);
        const tick = () => {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(rms * 5, 1)); // normaliza para 0–1
          animId = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        setTesting(false);
      }
    })();

    return () => {
      cancelAnimationFrame(animId);
      stream?.getTracks().forEach((t) => t.stop());
      ctx?.close();
      setLevel(0);
    };
  }, [testing, deviceId]);

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => setTesting(!testing)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          testing
            ? 'bg-danger/20 text-danger hover:bg-danger/30'
            : 'bg-surface-700 text-surface-200 hover:bg-surface-600'
        }`}
      >
        {testing ? 'Parar teste' : 'Testar microfone'}
      </button>
      {testing && (
        <div className="flex-1 h-2 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-success rounded-full transition-all duration-75"
            style={{ width: `${level * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

const NOISE_OPTIONS: { value: NoiseSuppression; label: string; desc: string }[] = [
  { value: 'off', label: 'Desligado', desc: 'Sem processamento — microfone cru' },
  { value: 'low', label: 'Baixo', desc: 'Apenas filtros básicos — para ambientes silenciosos' },
  { value: 'medium', label: 'Médio', desc: 'Noise gate + filtros — equilíbrio entre qualidade e supressão' },
  { value: 'high', label: 'Alto', desc: 'Processamento completo — melhor para ambientes ruidosos' },
];

function SelectField({ label, value, onChange, options }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-surface-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all appearance-none cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Toggle({ label, description, checked, onChange }: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-sm font-medium text-surface-200">{label}</p>
        {description && <p className="text-xs text-surface-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-accent-600' : 'bg-surface-600'
        }`}
      >
        <div
          className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function SliderField({ label, value, min, max, step, format, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-surface-300">{label}</label>
        <span className="text-xs text-surface-400 tabular-nums">{format(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 accent-accent-500 cursor-pointer"
      />
    </div>
  );
}

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-accent-400 flex-shrink-0">{icon}</span>
      <h2 className="text-base font-semibold text-surface-100">{title}</h2>
    </div>
  );
}

function AccountSection() {
  const user = useAuthStore((s) => s.user);
  const updateUsername = useAuthStore((s) => s.updateUsername);
  const [username, setUsername] = useState(user?.username ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => { setUsername(user?.username ?? ''); }, [user?.username]);

  const trimmed = username.trim();
  const isValid = /^[a-zA-Z0-9_]{3,32}$/.test(trimmed);
  const isDirty = trimmed !== (user?.username ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !isDirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateUsername(trimmed);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao atualizar o nome de usuário'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Conta"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-xl p-5 border border-surface-700/50">
        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-surface-300">Nome de usuário</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              maxLength={32}
              className="flex-1 px-3 py-2 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 text-sm focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
            />
            <button
              type="submit"
              disabled={!isValid || !isDirty || saving}
              className="px-4 py-2 bg-accent-600 hover:bg-accent-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : success ? (
            <p className="text-xs text-success">Nome de usuário atualizado.</p>
          ) : (
            <p className="text-xs text-surface-400">3–32 caracteres: letras, números e underscore.</p>
          )}
        </form>
      </div>
    </section>
  );
}

function MicSection({ inputs }: { inputs: DeviceInfo[] }) {
  const { inputDeviceId, inputVolume, setInputDevice, setInputVolume } = useSettingsStore();

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Microfone"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-xl p-5 space-y-5 border border-surface-700/50">
        <SelectField
          label="Dispositivo de entrada"
          value={inputDeviceId}
          onChange={setInputDevice}
          options={[
            { value: '', label: 'Padrão do sistema' },
            ...inputs.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
        />

        <SliderField
          label="Volume do microfone"
          value={Math.round(inputVolume * 100)}
          min={0}
          max={200}
          format={(v) => `${v}%`}
          onChange={(v) => setInputVolume(v / 100)}
        />

        <MicTest deviceId={inputDeviceId} />
      </div>
    </section>
  );
}

function OutputSection({ outputs }: { outputs: DeviceInfo[] }) {
  const { outputDeviceId, setOutputDevice } = useSettingsStore();

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Saída de áudio"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-xl p-5 space-y-5 border border-surface-700/50">
        <SelectField
          label="Dispositivo de saída"
          value={outputDeviceId}
          onChange={setOutputDevice}
          options={[
            { value: '', label: 'Padrão do sistema' },
            ...outputs.map((d) => ({ value: d.deviceId, label: d.label })),
          ]}
        />

        <p className="text-xs text-surface-500">
          O volume de saída é controlado pelo slider na chamada (0–200%).
        </p>
      </div>
    </section>
  );
}

function ProcessingSection() {
  const { noiseSuppression, echoCancellation, autoGainControl, setNoiseSuppression, setEchoCancellation, setAutoGainControl } =
    useSettingsStore();

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Processamento de áudio"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-xl p-5 space-y-5 border border-surface-700/50">
        {/* Nível de supressão */}
        <div className="space-y-3">
          <label className="text-sm font-medium text-surface-300">Supressão de ruído</label>
          <div className="grid grid-cols-2 gap-2">
            {NOISE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setNoiseSuppression(opt.value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  noiseSuppression === opt.value
                    ? 'border-accent-500 bg-accent-600/10'
                    : 'border-surface-600 bg-surface-900 hover:border-surface-500'
                }`}
              >
                <p className={`text-sm font-medium ${
                  noiseSuppression === opt.value ? 'text-accent-400' : 'text-surface-200'
                }`}>
                  {opt.label}
                </p>
                <p className="text-[11px] text-surface-500 mt-0.5 leading-snug">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="h-px bg-surface-700" />

        <Toggle
          label="Cancelamento de eco"
          description="Evita que o som do seu alto-falante volte pelo microfone"
          checked={echoCancellation}
          onChange={setEchoCancellation}
        />

        <Toggle
          label="Controle automático de ganho"
          description="Normaliza automaticamente o volume do microfone"
          checked={autoGainControl}
          onChange={setAutoGainControl}
        />
      </div>
    </section>
  );
}

function NotificationsSection() {
  const { notifSound, notifPush, notifVolume, setNotifSound, setNotifPush, setNotifVolume } = useSettingsStore();

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Notificações"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-xl p-5 space-y-5 border border-surface-700/50">
        <Toggle
          label="Som de notificação"
          description="Toca um som ao receber mensagens em canais inativos"
          checked={notifSound}
          onChange={setNotifSound}
        />

        {notifSound && (
          <SliderField
            label="Volume da notificação"
            value={Math.round(notifVolume * 100)}
            min={0}
            max={100}
            format={(v) => `${v}%`}
            onChange={(v) => setNotifVolume(v / 100)}
          />
        )}

        <div className="h-px bg-surface-700" />

        <Toggle
          label="Notificações push"
          description="Exibe notificações do sistema ao receber mensagens"
          checked={notifPush}
          onChange={setNotifPush}
        />
      </div>
    </section>
  );
}

function InfoNote() {
  return (
    <div className="bg-surface-800/50 rounded-xl p-4 border border-surface-700/30">
      <div className="flex items-start gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-surface-500 flex-shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-xs text-surface-500 leading-relaxed">
          As configurações são salvas automaticamente e aplicadas na próxima chamada.
          O teste de microfone mostra o nível sem processamento de áudio.
        </p>
      </div>
    </div>
  );
}

// ─── Abas + busca ───────────────────────────────────────────
// Divide a página (antes uma rolagem única e longa) em abas por assunto, e
// a busca ignora a aba atual — mostra qualquer seção cujo nome/palavra-chave
// bata, com um atalho pra pular direto pra aba correspondente.

type TabId = 'account' | 'audio' | 'notifications';

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: 'account',
    label: 'Conta',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
  {
    id: 'audio',
    label: 'Áudio',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    ),
  },
  {
    id: 'notifications',
    label: 'Notificações',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
    ),
  },
];

const SECTION_META: { id: string; tabId: TabId; label: string; keywords: string }[] = [
  { id: 'account', tabId: 'account', label: 'Conta', keywords: 'conta usuário username nome perfil account' },
  { id: 'mic', tabId: 'audio', label: 'Microfone', keywords: 'microfone entrada input volume mic teste' },
  { id: 'output', tabId: 'audio', label: 'Saída de áudio', keywords: 'saída output alto-falante speaker áudio' },
  { id: 'processing', tabId: 'audio', label: 'Processamento de áudio', keywords: 'ruído noise supressão eco echo cancelamento ganho gain' },
  { id: 'notifications', tabId: 'notifications', label: 'Notificações', keywords: 'notificação som push volume' },
];

export function SettingsPage() {
  const setView = useUiStore((s) => s.setView);
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const [query, setQuery] = useState('');

  const { inputs, outputs } = useMediaDevices();

  const sectionNodes: Record<string, React.ReactNode> = {
    account: <AccountSection />,
    mic: <MicSection inputs={inputs} />,
    output: <OutputSection outputs={outputs} />,
    processing: <ProcessingSection />,
    notifications: <NotificationsSection />,
  };

  const q = query.trim().toLowerCase();
  const matches = q ? SECTION_META.filter((m) => m.label.toLowerCase().includes(q) || m.keywords.includes(q)) : [];

  const jumpToTab = (tabId: TabId) => {
    setActiveTab(tabId);
    setQuery('');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-surface-900">
      {/* Header */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-surface-700/50 flex-shrink-0">
        <button
          onClick={() => setView('home')}
          className="p-1.5 -ml-1 text-surface-400 hover:text-surface-100 hover:bg-surface-700 rounded transition-colors"
          title="Voltar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <h1 className="text-sm font-semibold text-surface-100">Configurações</h1>

        <div className="ml-auto relative w-56">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-500 pointer-events-none">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar configurações..."
            className="w-full pl-8 pr-7 py-1.5 bg-surface-800 border border-surface-700 rounded-lg text-xs text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 transition-colors"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              title="Limpar busca"
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-surface-500 hover:text-surface-200"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8">
          {q ? (
            matches.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-surface-400 text-sm">Nada encontrado para "{query.trim()}"</p>
              </div>
            ) : (
              <div className="space-y-8">
                {matches.map((m) => (
                  <div key={m.id}>
                    <button
                      onClick={() => jumpToTab(m.tabId)}
                      className="text-[10px] font-semibold uppercase tracking-widest text-accent-400 hover:text-accent-300 transition-colors mb-2 flex items-center gap-1"
                    >
                      {TABS.find((t) => t.id === m.tabId)?.label}
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                    {sectionNodes[m.id]}
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              {/* Abas */}
              <div className="flex gap-1 mb-8 border-b border-surface-700/50">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setActiveTab(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                      activeTab === t.id
                        ? 'border-accent-500 text-surface-50'
                        : 'border-transparent text-surface-400 hover:text-surface-200'
                    }`}
                  >
                    {t.icon}
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="space-y-10 pb-8">
                {activeTab === 'account' && sectionNodes.account}
                {activeTab === 'audio' && (
                  <>
                    {sectionNodes.mic}
                    {sectionNodes.output}
                    {sectionNodes.processing}
                    <InfoNote />
                  </>
                )}
                {activeTab === 'notifications' && sectionNodes.notifications}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
