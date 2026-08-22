import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { useEventStore } from '../../stores/eventStore';
import { useGroupStore } from '../../stores/groupStore';
import { useUiStore } from '../../stores/uiStore';
import { confirmDialog } from '../../stores/dialogStore';
import type { ServerEvent } from '../../types';

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function keyFor(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getMonthMatrix(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

function EventRow({ event, canManage, onRespond, onDelete, onGoTo }: {
  event: ServerEvent;
  canManage: boolean;
  onRespond: (id: number, status: 'accepted' | 'declined') => void;
  onDelete: (event: ServerEvent) => void;
  onGoTo: (event: ServerEvent) => void;
}) {
  const isPending = event.myStatus === null;
  const time = new Date(event.scheduledAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-surface-100 truncate">{event.title}</p>
          <p className="text-xs text-surface-500 truncate">
            {event.groupName} · {event.channelKind === 'voice' ? '🔊' : '#'} {event.channelName} · {time}
          </p>
        </div>
        {canManage && (
          <button
            onClick={() => onDelete(event)}
            title="Excluir evento"
            className="p-1 rounded text-surface-500 hover:text-danger hover:bg-white/[0.06] transition-colors flex-shrink-0"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        )}
      </div>

      {event.description && <p className="text-xs text-surface-400 leading-relaxed">{event.description}</p>}

      <div className="flex items-center gap-2 mt-1">
        {isPending ? (
          <>
            <button
              onClick={() => onRespond(event.id, 'accepted')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-success/20 text-success hover:bg-success/30 transition-colors"
            >
              Aceitar
            </button>
            <button
              onClick={() => onRespond(event.id, 'declined')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.06] text-surface-300 hover:bg-white/[0.1] transition-colors"
            >
              Recusar
            </button>
          </>
        ) : event.myStatus === 'accepted' ? (
          <button
            onClick={() => onGoTo(event)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-accent-600 text-on-accent hover:brightness-110 transition-colors"
          >
            Ir para o canal
          </button>
        ) : (
          <span className="text-xs text-surface-500">Recusado</span>
        )}
      </div>
    </div>
  );
}

export function EventsHub() {
  const events = useEventStore((s) => s.events);
  const loadEvents = useEventStore((s) => s.loadEvents);
  const respond = useEventStore((s) => s.respond);
  const deleteEvent = useEventStore((s) => s.deleteEvent);
  const currentUser = useAuthStore((s) => s.user);
  const groups = useGroupStore((s) => s.groups);
  const setView = useUiStore((s) => s.setView);
  const setActiveGroup = useGroupStore((s) => s.setActiveGroup);
  const setPendingChannelId = useGroupStore((s) => s.setPendingChannelId);

  const [cursor, setCursor] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<Date>(() => new Date());

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const weeks = useMemo(() => getMonthMatrix(year, month), [year, month]);
  const today = useMemo(() => new Date(), []);

  // Recusados somem do calendário — já foram dispensados, não precisam poluir a grade.
  const eventsByDay = useMemo(() => {
    const map = new Map<string, ServerEvent[]>();
    for (const e of events) {
      if (e.myStatus === 'declined') continue;
      const d = new Date(e.scheduledAt);
      const key = keyFor(d);
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const selectedEvents = useMemo(
    () => (eventsByDay.get(keyFor(selectedDay)) ?? []).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [eventsByDay, selectedDay],
  );

  const canManage = (e: ServerEvent) => {
    if (Number(e.creator.id) === Number(currentUser?.id)) return true;
    const group = groups.find((g) => g.id === e.groupId);
    return !!group && Number(group.ownerId) === Number(currentUser?.id);
  };

  const handleRespond = (eventId: number, status: 'accepted' | 'declined') => {
    respond(eventId, status).catch(() => {});
  };

  const handleDelete = async (event: ServerEvent) => {
    const ok = await confirmDialog('Essa ação não pode ser desfeita.', {
      title: `Excluir "${event.title}"?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    deleteEvent(event.id).catch(() => {});
  };

  const handleGoTo = (event: ServerEvent) => {
    setView('group');
    if (event.channelKind === 'text') setPendingChannelId(event.channelId);
    setActiveGroup(event.groupId);
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 zk-surface shadow-panel rounded-2xl overflow-hidden">
      <header className="h-12 flex items-center gap-2 px-4 border-b border-white/[0.06] flex-shrink-0">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <h2 className="text-base font-bold text-surface-100">Eventos</h2>
        <span className="text-xs text-surface-500 ml-2">
          Dono/admin de um servidor cria eventos pelo cabeçalho do servidor
        </span>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Calendário */}
        <div className="w-[380px] flex-shrink-0 p-5 border-r border-white/[0.06] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setCursor(new Date(year, month - 1, 1))}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-white/[0.06] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-sm font-semibold text-surface-100 capitalize">
              {cursor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
            <button
              onClick={() => setCursor(new Date(year, month + 1, 1))}
              className="p-1.5 rounded-lg text-surface-400 hover:text-surface-100 hover:bg-white/[0.06] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="text-center text-[10px] font-semibold text-surface-500 uppercase">{w}</span>
            ))}
          </div>

          <div className="flex flex-col gap-1">
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 gap-1">
                {week.map((d, di) => {
                  if (!d) return <div key={di} />;
                  const dayEvents = eventsByDay.get(keyFor(d)) ?? [];
                  const hasPending = dayEvents.some((e) => e.myStatus === null);
                  const selected = keyFor(d) === keyFor(selectedDay);
                  const isToday = keyFor(d) === keyFor(today);
                  return (
                    <button
                      key={di}
                      onClick={() => setSelectedDay(d)}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center gap-0.5 text-xs transition-colors ${
                        selected ? 'bg-accent-600 text-on-accent' : isToday ? 'bg-white/[0.08] text-surface-100' : 'text-surface-300 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span>{d.getDate()}</span>
                      {dayEvents.length > 0 && (
                        <span className={`w-1.5 h-1.5 rounded-full ${selected ? 'bg-white' : hasPending ? 'bg-warning' : 'bg-accent-500'}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Eventos do dia selecionado */}
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-sm font-semibold text-surface-200 mb-3 capitalize">
            {selectedDay.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
          </h3>

          {selectedEvents.length === 0 ? (
            <p className="text-sm text-surface-500">Nenhum evento nesse dia.</p>
          ) : (
            <div className="flex flex-col gap-2 max-w-md">
              {selectedEvents.map((e) => (
                <EventRow
                  key={e.id}
                  event={e}
                  canManage={canManage(e)}
                  onRespond={handleRespond}
                  onDelete={handleDelete}
                  onGoTo={handleGoTo}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
