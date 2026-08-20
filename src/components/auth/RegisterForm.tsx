import { useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useEditableContextMenu } from '../../hooks/useEditableContextMenu';

interface Props {
  onSwitch: () => void;
}

export function RegisterForm({ onSwitch }: Props) {
  const [username, setUsername] = useState('');
  const [tag, setTag] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading, error, clearError } = useAuthStore();
  const usernameRef = useRef<HTMLInputElement>(null);
  const tagRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const handleUsernameContextMenu = useEditableContextMenu(usernameRef);
  const handleTagContextMenu = useEditableContextMenu(tagRef);
  const handleEmailContextMenu = useEditableContextMenu(emailRef);
  const handlePasswordContextMenu = useEditableContextMenu(passwordRef);

  const isTagValid = /^[a-zA-Z0-9]{3,5}$/.test(tag);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !isTagValid || !email.trim() || !password.trim()) return;
    await register(username.trim(), tag.trim(), email.trim(), password);
  };

  return (
    <div className="relative w-full max-w-md mx-4 p-8 zk-corners">
        <div className="text-center mb-8">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-accent-400 mb-3">Novo registro</p>
          <h1 className="text-3xl font-bold text-surface-50 mb-2 tracking-tight">Criar conta</h1>
          <p className="text-surface-400">Junte-se à conversa</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-danger/10 border border-danger/25 rounded-xl text-danger text-sm">
            {error}
            <button onClick={clearError} className="float-right text-danger/60 hover:text-danger">✕</button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-surface-300 mb-1.5">Usuário</label>
            <div className="flex items-stretch gap-1.5">
              <input
                ref={usernameRef}
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onContextMenu={handleUsernameContextMenu}
                className="flex-1 min-w-0 px-4 py-3 zk-input rounded-xl"
                placeholder="Escolha um nome"
                autoFocus
              />
              <div className="flex items-center flex-shrink-0 pl-1 text-surface-500 font-medium">#</div>
              <input
                ref={tagRef}
                type="text"
                value={tag}
                onChange={(e) => setTag(e.target.value.slice(0, 5))}
                onContextMenu={handleTagContextMenu}
                maxLength={5}
                className="w-20 flex-shrink-0 px-3 py-3 zk-input rounded-xl uppercase"
                placeholder="TAG"
              />
            </div>
            <p className="text-xs text-surface-500 mt-1.5">
              A tag identifica sua conta caso outra pessoa use o mesmo nome — 3 a 5 letras/números.
            </p>
          </div>

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
              placeholder="Mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 zk-btn-primary rounded-xl"
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
