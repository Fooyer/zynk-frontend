/**
 * Formata data para exibição no chat.
 * Hoje: "14:30"
 * Ontem: "Ontem 14:30"
 * Mais antigo: "15/01 14:30"
 */
export function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) return `Ontem ${time}`;

  const day = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return `${day} ${time}`;
}

/**
 * Gera iniciais do username para avatar placeholder.
 */
export function getInitials(username: string): string {
  return username.slice(0, 2).toUpperCase();
}

/**
 * Formata tamanho de arquivo pra exibição (chip de anexo genérico no chat).
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Gera cor consistente a partir do username (para avatars).
 */
export function getUserColor(username: string): string {
  // Todas as cores mantêm >=4.5:1 de contraste contra os fundos surface-800/900,
  // já que são usadas como texto (nome de usuário) sobre o fundo escuro do app.
  const colors = [
    '#6c7bff', '#43b581', '#faa61a', '#f04747',
    '#7c8aff', '#e879f9', '#22d3ee', '#fb923c',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}
