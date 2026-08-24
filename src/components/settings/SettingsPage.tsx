import { useEffect, useState, useCallback, useRef } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useUiStore } from '../../stores/uiStore';
import { useThemeStore, type AccentMode, type AccentPreset } from '../../stores/themeStore';
import { PRESET_SWATCH, PRESET_LABELS } from '../../utils/accentPresets';
import { useAuthStore } from '../../stores/authStore';
import { getProcessedStream } from '../../services/audioProcessing';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';
import { useKeybindingsStore, type ShortcutActionId } from '../../stores/keybindingsStore';
import { useShortcutStatusStore } from '../../stores/shortcutStatusStore';
import { SHORTCUT_ACTIONS, SHORTCUT_ACTIONS_BY_ID, type ShortcutActionMeta } from '../../services/shortcutActions';
import { formatKeyCombo, keyComboEquals, keyComboFromEvent } from '../../utils/keyCombo';

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
    let stopFn: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      // Mesmo pipeline de uma call de verdade (RNNoise, gate, filtros,
      // volume), com monitor:true — toca de volta o resultado direto pelo
      // destino nativo do Web Audio, não via MediaStream/<audio> (um
      // MediaStreamTrack mono tocado por <audio> às vezes sai só no canal
      // esquerdo). É pra ouvir exatamente o que os amigos ouvem.
      const result = await getProcessedStream('normal', { monitor: true }).catch(() => null);
      if (cancelled || !result) {
        setTesting(false);
        return;
      }
      stopFn = result.stop;
      const { analyser } = result;

      if (analyser) {
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
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
      stopFn?.();
      setLevel(0);
    };
  }, [testing, deviceId]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setTesting(!testing)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            testing
              ? 'bg-danger/20 text-danger hover:bg-danger/30'
              : 'bg-white/[0.06] text-surface-200 hover:bg-white/[0.12]'
          }`}
        >
          {testing ? 'Parar teste' : 'Testar microfone'}
        </button>
        {testing && (
          <div className="flex-1 h-2 bg-white/[0.08] rounded-full overflow-hidden">
            <div
              className="h-full bg-success rounded-full transition-all duration-75"
              style={{ width: `${level * 100}%` }}
            />
          </div>
        )}
      </div>
      {testing && (
        <p className="text-[11px] text-surface-500">
          Você vai se ouvir com o mesmo processamento da call — use fone de ouvido pra evitar eco.
        </p>
      )}
    </div>
  );
}

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
        className="w-full px-3 py-2.5 rounded-xl text-sm appearance-none cursor-pointer zk-input"
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
          checked ? 'bg-accent-600 hover:bg-accent-500' : 'bg-white/[0.10] hover:bg-white/[0.16]'
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
        className="w-full cursor-pointer"
        style={{
          background: `linear-gradient(to right, rgb(var(--color-accent-500)) ${((value - min) / (max - min)) * 100}%, rgb(var(--color-surface-700)) ${((value - min) / (max - min)) * 100}%)`,
        }}
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
  const updateIdentity = useAuthStore((s) => s.updateIdentity);
  const [username, setUsername] = useState(user?.username ?? '');
  const [tag, setTag] = useState(user?.tag ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const handleUsernameContextMenu = useEditableContextMenu(usernameRef);
  const tagRef = useRef<HTMLInputElement>(null);
  const handleTagContextMenu = useEditableContextMenu(tagRef);

  useEffect(() => { setUsername(user?.username ?? ''); setTag(user?.tag ?? ''); }, [user?.username, user?.tag]);

  const trimmedUsername = username.trim();
  const trimmedTag = tag.trim().toUpperCase();
  const isUsernameValid = /^[a-zA-Z0-9_]{3,32}$/.test(trimmedUsername);
  const isTagValid = /^[a-zA-Z0-9]{3,5}$/.test(trimmedTag);
  const isDirty = trimmedUsername !== (user?.username ?? '') || trimmedTag !== (user?.tag ?? '');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isUsernameValid || !isTagValid || !isDirty || saving) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      await updateIdentity(trimmedUsername, trimmedTag);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2500);
    } catch (err: any) {
      const msg = err.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Erro ao atualizar a conta'));
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = () => {
    if (!user) return;
    navigator.clipboard.writeText(`${user.username}#${user.tag}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
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

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/[0.06] shadow-panel space-y-5">
        {/* Identificador completo — o que a pessoa compartilha pra ser adicionada */}
        {user && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface-900 rounded-xl border border-white/[0.06]">
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-surface-500 uppercase tracking-wide mb-0.5">Seu identificador</p>
              <p className="text-sm font-semibold text-surface-100 truncate">
                {user.username}<span className="text-surface-500">#{user.tag}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] text-surface-300 hover:bg-white/[0.12] hover:text-surface-100 transition-colors flex-shrink-0 flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Copiado
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copiar
                </>
              )}
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="flex flex-col gap-2">
          <label className="text-sm font-medium text-surface-300">Editar nome e tag</label>
          <div className="flex items-center gap-1.5">
            <input
              ref={usernameRef}
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              onContextMenu={handleUsernameContextMenu}
              maxLength={32}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl text-sm zk-input"
            />
            <span className="text-surface-500 font-medium flex-shrink-0">#</span>
            <input
              ref={tagRef}
              type="text"
              value={tag}
              onChange={(e) => { setTag(e.target.value.slice(0, 5)); setError(null); }}
              onContextMenu={handleTagContextMenu}
              maxLength={5}
              className="w-20 flex-shrink-0 px-2.5 py-2 rounded-xl text-sm uppercase zk-input"
            />
            <button
              type="submit"
              disabled={!isUsernameValid || !isTagValid || !isDirty || saving}
              className="px-4 py-2 zk-btn-primary text-sm rounded-lg flex-shrink-0"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {error ? (
            <p className="text-xs text-danger">{error}</p>
          ) : success ? (
            <p className="text-xs text-success">Conta atualizada.</p>
          ) : (
            <p className="text-xs text-surface-400">Nome: 3–32 caracteres (letras, números e underscore). Tag: 3–5 letras/números.</p>
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

      <div className="bg-surface-800 rounded-2xl p-5 space-y-5 border border-white/[0.06] shadow-panel">
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

      <div className="bg-surface-800 rounded-2xl p-5 space-y-5 border border-white/[0.06] shadow-panel">
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
  const {
    noiseSuppression, echoCancellation, autoGainControl,
    noiseGateEnabled, noiseGateAuto, noiseGateThreshold,
    setNoiseSuppression, setEchoCancellation, setAutoGainControl,
    setNoiseGateEnabled, setNoiseGateAuto, setNoiseGateThreshold,
  } = useSettingsStore();

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

      <div className="bg-surface-800 rounded-2xl p-5 space-y-5 border border-white/[0.06] shadow-panel">
        <Toggle
          label="Supressão de ruído"
          description="RNNoise (IA) remove ruído de fundo (mouse, teclado etc.) de forma contínua, sem cortar sua voz"
          checked={noiseSuppression}
          onChange={setNoiseSuppression}
        />

        <div className="h-px bg-white/[0.06]" />

        <div className={!noiseSuppression ? 'opacity-40 pointer-events-none' : ''}>
          <Toggle
            label="Isolamento de voz"
            description="Atenua o que sobra de ruído de fundo nas pausas entre as falas (ventilador, trânsito, gente conversando ao fundo)"
            checked={noiseGateEnabled}
            onChange={setNoiseGateEnabled}
          />

          {noiseGateEnabled && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-0.5 p-0.5 bg-surface-900/60 border border-white/[0.08] rounded-lg w-fit">
                <button
                  type="button"
                  onClick={() => setNoiseGateAuto(true)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    noiseGateAuto ? 'bg-accent-600/20 text-accent-300' : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Automático
                </button>
                <button
                  type="button"
                  onClick={() => setNoiseGateAuto(false)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    !noiseGateAuto ? 'bg-accent-600/20 text-accent-300' : 'text-surface-400 hover:text-surface-200'
                  }`}
                >
                  Manual
                </button>
              </div>

              {noiseGateAuto ? (
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  Calibra sozinho acompanhando o ruído do seu ambiente — ideal na maioria dos casos.
                </p>
              ) : (
                <>
                  <SliderField
                    label="Sensibilidade"
                    value={noiseGateThreshold}
                    min={-60}
                    max={-10}
                    step={1}
                    format={(v) => `${v} dB`}
                    onChange={setNoiseGateThreshold}
                  />
                  <p className="text-[11px] text-surface-500 leading-relaxed">
                    Sons abaixo desse volume são atenuados. Valores menores (mais à esquerda) isolam mais,
                    mas podem cortar sua voz quando ela fica baixa — use "Testar microfone" acima pra ajustar ouvindo o resultado.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-white/[0.06]" />

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

function ShortcutRow({ action }: { action: ShortcutActionMeta }) {
  const combo = useKeybindingsStore((s) => s.bindings[action.id]);
  const setBinding = useKeybindingsStore((s) => s.setBinding);
  const failedGlobal = useShortcutStatusStore((s) => s.failedGlobalActions.has(action.id));
  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    setConflict(null);

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Esc sozinho cancela a captura — só vira atalho de verdade com
      // modificador junto (ex.: Ctrl+Esc).
      if (e.code === 'Escape' && !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey) {
        setRecording(false);
        return;
      }

      const next = keyComboFromEvent(e);
      if (!next) return; // só um modificador solto — ainda esperando a tecla de verdade

      const bindings = useKeybindingsStore.getState().bindings;
      const usedBy = Object.entries(bindings).find(
        ([otherId, otherCombo]) => otherId !== action.id && otherCombo && keyComboEquals(otherCombo, next),
      );
      if (usedBy) {
        const label = SHORTCUT_ACTIONS_BY_ID.get(usedBy[0] as ShortcutActionId)?.label ?? usedBy[0];
        setConflict(`Já usado por "${label}"`);
        return;
      }

      setBinding(action.id, next);
      setRecording(false);
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [recording, action.id, setBinding]);

  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-surface-200">{action.label}</p>
        <p className="text-xs text-surface-500 mt-0.5">{action.description}</p>
        {conflict ? (
          <p className="text-[11px] text-danger mt-1">{conflict}</p>
        ) : failedGlobal && !recording ? (
          <p className="text-[11px] text-warning mt-1">
            Não registrou como atalho global (talvez já esteja em uso por outro programa) — funciona só com o Zynk em foco.
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => setRecording((r) => !r)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium tabular-nums transition-colors min-w-[112px] text-center ${
            recording
              ? 'bg-accent-600/20 text-accent-300 ring-1 ring-accent-500'
              : combo
              ? 'bg-white/[0.08] text-surface-100 hover:bg-white/[0.14]'
              : 'bg-white/[0.06] text-surface-500 hover:bg-white/[0.12]'
          }`}
        >
          {recording ? 'Pressione uma tecla…' : combo ? formatKeyCombo(combo) : 'Definir atalho'}
        </button>
        {combo && !recording && (
          <button
            onClick={() => setBinding(action.id, null)}
            title="Remover atalho"
            className="w-7 h-7 flex items-center justify-center text-surface-500 hover:text-danger hover:bg-white/[0.06] rounded-lg transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function ShortcutsSection() {
  const isElectron = !!window.electronAPI?.setGlobalShortcuts;

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Atalhos"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <line x1="6" y1="10" x2="6" y2="10" /><line x1="10" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="14" y2="10" /><line x1="18" y1="10" x2="18" y2="10" />
            <line x1="6" y1="14" x2="18" y2="14" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/[0.06] shadow-panel">
        <p className="text-xs text-surface-500 mb-4 leading-relaxed">
          {isElectron
            ? 'Funcionam em qualquer lugar, mesmo com o Zynk minimizado ou sem foco — ideal pra mutar durante um jogo, por exemplo. Evite combinações de uma tecla só (ex.: só "M"), que também disparariam enquanto você digita em algum campo de texto.'
            : 'Funcionam só com a janela do Zynk em foco.'}
        </p>
        <div className="divide-y divide-white/[0.06]">
          {SHORTCUT_ACTIONS.map((action) => (
            <ShortcutRow key={action.id} action={action} />
          ))}
        </div>
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

      <div className="bg-surface-800 rounded-2xl p-5 space-y-5 border border-white/[0.06] shadow-panel">
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

        <div className="h-px bg-white/[0.06]" />

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

function AppearanceSection() {
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const OPTIONS: { id: 'dark' | 'light'; label: string; icon: React.ReactNode }[] = [
    {
      id: 'dark',
      label: 'Escuro',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      id: 'light',
      label: 'Claro',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ),
    },
  ];

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Aparência"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/[0.06] shadow-panel space-y-4">
        <p className="text-xs text-surface-500">Claro ou escuro — afeta o fundo, os painéis e a barra superior do app.</p>

        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setMode(o.id)}
              aria-pressed={mode === o.id}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-medium transition-colors ${
                mode === o.id
                  ? 'border-accent-500 bg-accent-600/10 text-surface-50'
                  : 'border-white/[0.06] text-surface-300 hover:border-white/[0.18]'
              }`}
            >
              {o.icon}
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function AccentSection() {
  const accentMode = useThemeStore((s) => s.accentMode);
  const accentPreset = useThemeStore((s) => s.accentPreset);
  const customColor = useThemeStore((s) => s.customColor);
  const gradientFrom = useThemeStore((s) => s.gradientFrom);
  const gradientTo = useThemeStore((s) => s.gradientTo);
  const setAccentMode = useThemeStore((s) => s.setAccentMode);
  const setAccentPreset = useThemeStore((s) => s.setAccentPreset);
  const setCustomColor = useThemeStore((s) => s.setCustomColor);
  const setGradient = useThemeStore((s) => s.setGradient);

  const MODE_TABS: { id: AccentMode; label: string }[] = [
    { id: 'preset', label: 'Predefinida' },
    { id: 'custom', label: 'Personalizada' },
    { id: 'gradient', label: 'Gradiente' },
  ];

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Cor de destaque"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/[0.06] shadow-panel space-y-4">
        <p className="text-xs text-surface-500">
          Cor dos botões, ícones ativos e da barra superior — escolha uma cor predefinida, sua própria cor, ou um gradiente entre duas cores.
        </p>

        <div className="flex gap-1 p-1 bg-surface-900/60 rounded-xl w-fit">
          {MODE_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAccentMode(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                accentMode === t.id ? 'bg-accent-600 text-on-accent' : 'text-surface-400 hover:text-surface-100'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {accentMode === 'preset' && (
          <div className="grid grid-cols-4 gap-3">
            {(Object.keys(PRESET_SWATCH) as AccentPreset[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setAccentPreset(id)}
                aria-pressed={accentPreset === id}
                className={`relative rounded-xl p-2.5 border-2 bg-surface-900 transition-colors ${
                  accentPreset === id ? 'border-accent-500' : 'border-white/[0.06] hover:border-white/[0.18]'
                }`}
              >
                <span className="block w-full h-8 rounded-lg mb-2" style={{ backgroundColor: PRESET_SWATCH[id] }} />
                <span className="block text-[11px] font-medium text-center text-surface-200">{PRESET_LABELS[id]}</span>
                {accentPreset === id && (
                  <span
                    className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: PRESET_SWATCH[id] }}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {accentMode === 'custom' && (
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              className="w-12 h-12 rounded-lg border border-white/[0.08] bg-transparent cursor-pointer"
              aria-label="Cor de destaque personalizada"
            />
            <div>
              <p className="text-sm font-medium text-surface-200">{customColor.toUpperCase()}</p>
              <p className="text-xs text-surface-500">Clique no quadrado pra escolher a cor</p>
            </div>
          </div>
        )}

        {accentMode === 'gradient' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={gradientFrom}
                onChange={(e) => setGradient(e.target.value, gradientTo)}
                className="w-12 h-12 rounded-lg border border-white/[0.08] bg-transparent cursor-pointer"
                aria-label="Primeira cor do gradiente"
              />
              <input
                type="color"
                value={gradientTo}
                onChange={(e) => setGradient(gradientFrom, e.target.value)}
                className="w-12 h-12 rounded-lg border border-white/[0.08] bg-transparent cursor-pointer"
                aria-label="Segunda cor do gradiente"
              />
              <div>
                <p className="text-sm font-medium text-surface-200">
                  {gradientFrom.toUpperCase()} → {gradientTo.toUpperCase()}
                </p>
                <p className="text-xs text-surface-500">Aplicado nos botões e destaques principais</p>
              </div>
            </div>
            <div
              className="h-10 rounded-xl border border-white/[0.08]"
              style={{ background: `linear-gradient(135deg, ${gradientFrom}, ${gradientTo})` }}
            />
          </div>
        )}
      </div>
    </section>
  );
}

function InfoNote() {
  return (
    <div className="bg-surface-800/50 rounded-2xl p-4 border border-white/[0.05]">
      <div className="flex items-start gap-3">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-surface-500 flex-shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <p className="text-xs text-surface-500 leading-relaxed">
          As configurações são salvas automaticamente e aplicadas na próxima chamada.
          O teste de microfone toca de volta o áudio já processado — o mesmo que os amigos ouvem.
        </p>
      </div>
    </div>
  );
}

// ─── Abas + busca ───────────────────────────────────────────
// Divide a página (antes uma rolagem única e longa) em abas por assunto, e
// a busca ignora a aba atual — mostra qualquer seção cujo nome/palavra-chave
// bata, com um atalho pra pular direto pra aba correspondente.

type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'not-available' }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'ready'; version: string }
  | { kind: 'error'; message: string };

function UpdatesSection() {
  const [appVersion, setAppVersion] = useState('');
  const [status, setStatus] = useState<UpdateStatus>({ kind: 'idle' });

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.getAppVersion().then(setAppVersion);
    window.electronAPI.onUpdateChecking(() => setStatus({ kind: 'checking' }));
    window.electronAPI.onUpdateAvailable((version) => setStatus({ kind: 'downloading', version, percent: 0 }));
    window.electronAPI.onUpdateNotAvailable(() => setStatus({ kind: 'not-available' }));
    window.electronAPI.onUpdateProgress((percent) => {
      setStatus((prev) => (prev.kind === 'downloading' ? { ...prev, percent } : prev));
    });
    window.electronAPI.onUpdateDownloaded((version) => setStatus({ kind: 'ready', version }));
    window.electronAPI.onUpdateError((message) => setStatus({ kind: 'error', message }));
  }, []);

  const checking = status.kind === 'checking';
  const busy = checking || status.kind === 'downloading';

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Sobre"
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        }
      />

      <div className="bg-surface-800 rounded-2xl p-5 border border-white/[0.06] shadow-panel space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-surface-200">Zynk</p>
            <p className="text-xs text-surface-500 mt-0.5">Versão {appVersion || '—'}</p>
          </div>
          <button
            type="button"
            onClick={() => window.electronAPI?.checkForUpdates()}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] text-surface-300 hover:bg-white/[0.12] hover:text-surface-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {checking ? 'Verificando...' : 'Verificar atualizações'}
          </button>
        </div>

        {status.kind !== 'idle' && (
          <div className="pt-3 border-t border-white/[0.06]">
            {status.kind === 'checking' && <p className="text-xs text-surface-400">Verificando atualizações...</p>}
            {status.kind === 'not-available' && <p className="text-xs text-success">Você já está na versão mais recente.</p>}
            {status.kind === 'error' && <p className="text-xs text-danger">Não foi possível verificar agora. Tente de novo mais tarde.</p>}
            {status.kind === 'downloading' && (
              <div className="space-y-2">
                <p className="text-xs text-surface-400">Baixando versão {status.version} — {status.percent}%</p>
                <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden">
                  <div className="h-full bg-accent-500 transition-all duration-300" style={{ width: `${status.percent}%` }} />
                </div>
              </div>
            )}
            {status.kind === 'ready' && (
              <div className="flex items-center justify-between">
                <p className="text-xs text-surface-400">Versão {status.version} pronta para instalar.</p>
                <button
                  type="button"
                  onClick={() => window.electronAPI?.restartToUpdate()}
                  className="zk-btn-primary px-3 py-1.5 text-xs rounded-lg"
                >
                  Reiniciar agora
                </button>
              </div>
            )}
          </div>
        )}

        {!window.electronAPI && (
          <p className="text-xs text-surface-500">Atualizações automáticas só estão disponíveis no app instalado.</p>
        )}
      </div>
    </section>
  );
}

type TabId = 'account' | 'audio' | 'shortcuts' | 'notifications' | 'theme' | 'about';

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
    id: 'shortcuts',
    label: 'Atalhos',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="12" rx="2" />
        <line x1="6" y1="10" x2="6" y2="10" /><line x1="10" y1="10" x2="10" y2="10" /><line x1="14" y1="10" x2="14" y2="10" /><line x1="18" y1="10" x2="18" y2="10" />
        <line x1="6" y1="14" x2="18" y2="14" />
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
  {
    id: 'theme',
    label: 'Tema',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
        <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
        <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
        <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
      </svg>
    ),
  },
  {
    id: 'about',
    label: 'Sobre',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
  },
];

const SECTION_META: { id: string; tabId: TabId; label: string; keywords: string }[] = [
  { id: 'account', tabId: 'account', label: 'Conta', keywords: 'conta usuário username nome perfil account' },
  { id: 'mic', tabId: 'audio', label: 'Microfone', keywords: 'microfone entrada input volume mic teste' },
  { id: 'output', tabId: 'audio', label: 'Saída de áudio', keywords: 'saída output alto-falante speaker áudio' },
  { id: 'processing', tabId: 'audio', label: 'Processamento de áudio', keywords: 'ruído noise supressão eco echo cancelamento ganho gain isolamento voz gate sensibilidade fundo' },
  { id: 'shortcuts', tabId: 'shortcuts', label: 'Atalhos', keywords: 'atalho shortcut tecla hotkey mutar desmutar mudo global teclado bind' },
  { id: 'notifications', tabId: 'notifications', label: 'Notificações', keywords: 'notificação som push volume' },
  { id: 'appearance', tabId: 'theme', label: 'Aparência', keywords: 'tema aparência claro escuro dark light modo' },
  { id: 'accent', tabId: 'theme', label: 'Cor de destaque', keywords: 'cor destaque acento accent gradiente personalizada predefinida paleta' },
  { id: 'about', tabId: 'about', label: 'Sobre', keywords: 'sobre versão atualização update verificar' },
];

export function SettingsPage() {
  const setView = useUiStore((s) => s.setView);
  const [activeTab, setActiveTab] = useState<TabId>('account');
  const [query, setQuery] = useState('');
  const queryRef = useRef<HTMLInputElement>(null);
  const handleQueryContextMenu = useEditableContextMenu(queryRef);

  const { inputs, outputs } = useMediaDevices();

  const sectionNodes: Record<string, React.ReactNode> = {
    account: <AccountSection />,
    mic: <MicSection inputs={inputs} />,
    output: <OutputSection outputs={outputs} />,
    processing: <ProcessingSection />,
    shortcuts: <ShortcutsSection />,
    notifications: <NotificationsSection />,
    appearance: <AppearanceSection />,
    accent: <AccentSection />,
    about: <UpdatesSection />,
  };

  const q = query.trim().toLowerCase();
  const matches = q ? SECTION_META.filter((m) => m.label.toLowerCase().includes(q) || m.keywords.includes(q)) : [];

  const jumpToTab = (tabId: TabId) => {
    setActiveTab(tabId);
    setQuery('');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 zk-surface shadow-panel rounded-2xl overflow-hidden">
      {/* Header */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-white/[0.06] flex-shrink-0">
        <button
          onClick={() => setView('home')}
          className="p-1.5 -ml-1 text-surface-400 hover:text-surface-100 hover:bg-white/[0.08] rounded transition-colors"
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
            ref={queryRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onContextMenu={handleQueryContextMenu}
            placeholder="Buscar configurações..."
            className="w-full pl-8 pr-7 py-1.5 rounded-xl text-xs zk-input"
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
              <div className="flex gap-1 mb-8 border-b border-white/[0.06]">
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

              <div key={activeTab} className="space-y-10 pb-8 animate-fade-in">
                {activeTab === 'account' && sectionNodes.account}
                {activeTab === 'audio' && (
                  <>
                    {sectionNodes.mic}
                    {sectionNodes.output}
                    {sectionNodes.processing}
                    <InfoNote />
                  </>
                )}
                {activeTab === 'shortcuts' && sectionNodes.shortcuts}
                {activeTab === 'notifications' && sectionNodes.notifications}
                {activeTab === 'theme' && (
                  <>
                    {sectionNodes.appearance}
                    {sectionNodes.accent}
                  </>
                )}
                {activeTab === 'about' && sectionNodes.about}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
