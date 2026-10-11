import { useState } from 'react';
import { authAPI } from '../../services/api';

interface Props {
  onBack: () => void;
}

type Step = 'email' | 'reset' | 'done';

function errorMessage(err: any, fallback: string): string {
  if (err.response?.status === 429) return 'Muitas tentativas. Aguarde um minuto e tente de novo.';
  const msg = err.response?.data?.message;
  return Array.isArray(msg) ? msg[0] : (msg ?? fallback);
}

export function ForgotPasswordForm({ onBack }: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const requestCode = async (isResend: boolean) => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      await authAPI.forgotPassword({ email: email.trim() });
      setStep('reset');
      setResent(isResend);
    } catch (err: any) {
      setError(errorMessage(err, 'Não foi possível enviar o código'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = (e: React.FormEvent) => {
    e.preventDefault();
    requestCode(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (newPassword.length < 6) return setError('A nova senha precisa ter ao menos 6 caracteres');
    if (newPassword !== confirm) return setError('As senhas não conferem');
    setLoading(true);
    setError(null);
    try {
      await authAPI.resetPassword({ email: email.trim(), code, newPassword });
      setStep('done');
    } catch (err: any) {
      setError(errorMessage(err, 'Não foi possível redefinir a senha'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md mx-4 p-8 zk-corners">
      <div className="text-center mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent-400 mb-3">Recuperação de acesso</p>
        <h1 className="text-3xl font-bold text-surface-50 mb-2 tracking-tight">Esqueci minha senha</h1>
        <p className="text-surface-400">
          {step === 'email' && 'Enviaremos um código para o e-mail cadastrado'}
          {step === 'reset' && 'Digite o código que enviamos e escolha a nova senha'}
          {step === 'done' && 'Senha redefinida com sucesso'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-xl text-danger text-sm">{error}</div>
      )}

      {step === 'email' && (
        <form onSubmit={handleSendCode} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 zk-input rounded-xl"
              placeholder="seu@email.com"
              autoFocus
            />
          </div>
          <button type="submit" disabled={loading || !email.trim()} className="w-full py-3 zk-btn-primary rounded-xl">
            {loading ? 'Enviando...' : 'Enviar código'}
          </button>
        </form>
      )}

      {step === 'reset' && (
        <form onSubmit={handleReset} className="space-y-4">
          <p className="text-xs text-surface-400">
            Se <span className="text-surface-200">{email.trim()}</span> estiver cadastrado, o código chega em instantes
            (vale por 10 minutos). Confira também o spam.
          </p>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Código de 6 dígitos</label>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(null); }}
              className="w-full px-4 py-3 zk-input rounded-xl tracking-[0.4em] text-center text-lg"
              placeholder="000000"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Nova senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
              className="w-full px-4 py-3 zk-input rounded-xl"
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Confirmar nova senha</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setError(null); }}
              className="w-full px-4 py-3 zk-input rounded-xl"
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={loading || code.length !== 6 || !newPassword}
            className="w-full py-3 zk-btn-primary rounded-xl"
          >
            {loading ? 'Salvando...' : 'Redefinir senha'}
          </button>
          <div className="flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => requestCode(true)}
              disabled={loading}
              className="text-accent-400 hover:text-accent-500 font-medium"
            >
              Reenviar código
            </button>
            {resent && <span className="text-success">Novo código solicitado</span>}
          </div>
        </form>
      )}

      {step === 'done' && (
        <button onClick={onBack} className="w-full py-3 zk-btn-primary rounded-xl">
          Ir para o login
        </button>
      )}

      {step !== 'done' && (
        <p className="mt-6 text-center text-surface-400 text-sm">
          <button onClick={onBack} className="text-accent-400 hover:text-accent-500 font-medium">
            Voltar ao login
          </button>
        </p>
      )}
    </div>
  );
}
