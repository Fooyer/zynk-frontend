import { useState } from 'react';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  onSwitch: () => void;
}

export function RegisterForm({ onSwitch }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !email.trim() || !password.trim()) return;
    await register(username.trim(), email.trim(), password);
  };

  return (
    <div className="w-full max-w-md p-8 bg-surface-800 rounded-2xl shadow-2xl mx-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-surface-50 mb-2">Criar conta</h1>
          <p className="text-surface-400">Junte-se à conversa</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {error}
            <button onClick={clearError} className="float-right text-danger/60 hover:text-danger">✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
              placeholder="Escolha um username"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Senha</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-surface-900 border border-surface-600 rounded-lg text-surface-100 placeholder-surface-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500 transition-all"
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-accent-500 hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors"
          >
            {isLoading ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-surface-400 text-sm">
          Já tem conta?{' '}
          <button onClick={onSwitch} className="text-accent-400 hover:text-accent-500 font-medium">
            Entrar
          </button>
        </p>
      </div>
  );
}
