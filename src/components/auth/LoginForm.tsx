import { useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';

interface Props {
  onSwitch: () => void;
}

export function LoginForm({ onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const handleEmailContextMenu = useEditableContextMenu(emailRef);
  const handlePasswordContextMenu = useEditableContextMenu(passwordRef);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;
    await login(email.trim(), password);
  };

  return (
    <div className="relative w-full max-w-md mx-4 p-8 zk-corners">
        <div className="text-center mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent-400 mb-3">Acesso ao sistema</p>
          <h1 className="text-3xl font-bold text-surface-50 mb-2 tracking-tight">Bem-vindo de volta</h1>
          <p className="text-surface-400">Entre para continuar conversando</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-xl text-danger text-sm">
            {error}
            <button onClick={clearError} className="float-right text-danger/60 hover:text-danger">✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Email</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onContextMenu={handleEmailContextMenu}
              className="w-full px-4 py-3 zk-input rounded-xl"
              placeholder="seu@email.com"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Senha</label>
            <input
              ref={passwordRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onContextMenu={handlePasswordContextMenu}
              className="w-full px-4 py-3 zk-input rounded-xl"
              placeholder="Sua senha"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 zk-btn-primary rounded-xl"
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-surface-400 text-sm">
          Não tem conta?{' '}
          <button onClick={onSwitch} className="text-accent-400 hover:text-accent-500 font-medium">
            Criar conta
          </button>
        </p>
      </div>
  );
}
