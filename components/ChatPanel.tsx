'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { ChatMessage, colorForName } from '@/lib/types';

type ChatPanelProps = {
  roomId: string;
  userName: string;
  joinEvents?: { name: string; ts: number }[];
};

type Reaction = { emoji: string; authors: string[] };
type ReactionMap = Record<string, Reaction[]>;

const PICKER_EMOJIS = [
  '😵‍💫', '🫠', '🥴', '🥵',
  '😂', '😮', '🔥', '❤️', '👏',
  '😭', '😈', '🥹',
];

const REACTION_EMOJIS = [
  '😵‍💫', '🫠', '😞', '🥴', '🥵',
  '👀', '😂', '🔥',
  '❤️', '😮',
];

function playJoinSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.35);
    osc.onended = () => ctx.close();
  } catch (_) {}
}

// Subtle "pop" sound when sending a message
function playMessageSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.06);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch (_) {}
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function applyReaction(prev: ReactionMap, messageId: string, emoji: string, author: string): ReactionMap {
  const msgReactions = [...(prev[messageId] ?? [])];
  const existing = msgReactions.find((r) => r.emoji === emoji);
  if (existing) {
    if (existing.authors.includes(author)) {
      const newAuthors = existing.authors.filter((a) => a !== author);
      if (newAuthors.length === 0) {
        return { ...prev, [messageId]: msgReactions.filter((r) => r.emoji !== emoji) };
      }
      return { ...prev, [messageId]: msgReactions.map((r) => r.emoji === emoji ? { ...r, authors: newAuthors } : r) };
    }
    return { ...prev, [messageId]: msgReactions.map((r) => r.emoji === emoji ? { ...r, authors: [...r.authors, author] } : r) };
  }
  return { ...prev, [messageId]: [...msgReactions, { emoji, authors: [author] }] };
}

export default function ChatPanel({ roomId, userName, joinEvents = [] }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ReactionMap>({});
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [showReactionFor, setShowReactionFor] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const reactionPickerRef = useRef<HTMLDivElement>(null);
  const reactChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
      if (reactionPickerRef.current && !reactionPickerRef.current.contains(e.target as Node)) setShowReactionFor(null);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    let active = true;
    async function loadHistory() {
      const { data } = await supabase
        .from('chat_messages').select('*').eq('room_id', roomId)
        .order('created_at', { ascending: true }).limit(200);
      if (active && data) setMessages(data as ChatMessage[]);
    }
    loadHistory();
    const channel = supabase.channel(`chat:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        setMessages((prev) => {
          // Deduplicate by id in case realtime fires twice
          const exists = prev.some((m) => m.id === (payload.new as ChatMessage).id);
          if (exists) return prev;
          return [...prev, payload.new as ChatMessage];
        });
      }).subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [roomId]);

  useEffect(() => {
    const channel = supabase.channel(`reactions:${roomId}`)
      .on('broadcast', { event: 'react' }, ({ payload }) => {
        const { messageId, emoji, author } = payload as { messageId: string; emoji: string; author: string };
        setReactions((prev) => applyReaction(prev, messageId, emoji, author));
      }).subscribe();
    reactChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); reactChannelRef.current = null; };
  }, [roomId]);

  const prevJoinLenRef = useRef(0);
  useEffect(() => {
    if (joinEvents.length > prevJoinLenRef.current) playJoinSound();
    prevJoinLenRef.current = joinEvents.length;
  }, [joinEvents]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, joinEvents]);

  async function sendMessage() {
    const body = draft.trim();
    if (!body) return;
    setDraft(''); setReplyTo(null); setShowPicker(false);
    playMessageSound();
    await supabase.from('chat_messages').insert({
      room_id: roomId, author_name: userName, body,
      reply_to_id: replyTo?.id ?? null,
      reply_to_author: replyTo?.author_name ?? null,
      reply_to_body: replyTo?.body ?? null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    if (e.key === 'Escape') { setReplyTo(null); setShowPicker(false); setShowReactionFor(null); }
  }

  async function sendReaction(messageId: string, emoji: string) {
    setShowReactionFor(null);
    setReactions((prev) => applyReaction(prev, messageId, emoji, userName));
    const ch = reactChannelRef.current;
    if (ch) await ch.send({ type: 'broadcast', event: 'react', payload: { messageId, emoji, author: userName } });
  }

  type SystemEvent = { _type: 'system'; id: string; ts: number; name: string };
  type ListItem = (ChatMessage & { _type: 'message' }) | SystemEvent;

  const listItems: ListItem[] = [
    ...messages.map((m) => ({ ...m, _type: 'message' as const })),
    ...joinEvents.map((je) => ({ _type: 'system' as const, id: `join-${je.name}-${je.ts}`, ts: je.ts, name: je.name })),
  ].sort((a, b) => {
    const tA = a._type === 'system' ? a.ts : new Date(a.created_at).getTime();
    const tB = b._type === 'system' ? b.ts : new Date(b.created_at).getTime();
    return tA - tB;
  });

  return (
    <div className="flex flex-col h-full rounded-xl overflow-hidden border border-white/[0.06] bg-[#0f1117]">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#0f1117]">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/30">Chat</span>
        </div>
        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_2px_rgba(52,211,153,0.5)] animate-pulse" />
      </div>

      {/* ── Messages ───────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 min-h-0">
        {listItems.length === 0 && (
          <p className="text-white/20 text-xs italic text-center mt-8">Todavía no hay mensajes. Saluda 👋</p>
        )}

        {listItems.map((item) => {

          if (item._type === 'system') {
            return (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px bg-white/[0.05]" />
                <span className="text-[10px] text-white/25 whitespace-nowrap font-medium">
                  <span style={{ color: colorForName(item.name) }}>{item.name}</span>
                  {' '}entró a la sala
                </span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>
            );
          }

          const m = item as ChatMessage & { _type: 'message'; reply_to_id?: string | null; reply_to_author?: string | null; reply_to_body?: string | null };
          const isMe = m.author_name === userName;
          const color = colorForName(m.author_name);
          const msgReactions = reactions[m.id] ?? [];
          const isHovered = hoveredMsgId === m.id;
          const showingReactPicker = showReactionFor === m.id;

          return (
            <div
              key={m.id}
              onMouseEnter={() => setHoveredMsgId(m.id)}
              onMouseLeave={() => { setHoveredMsgId(null); if (!showingReactPicker) setShowReactionFor(null); }}
              className={`group relative rounded-lg px-3 py-2 transition-colors duration-100 ${isHovered || showingReactPicker ? 'bg-white/[0.04]' : ''}`}
            >
              {m.reply_to_author && (
                <div className="flex items-center gap-2 mb-1.5 pl-2.5 border-l-2 border-white/10 rounded-sm">
                  <p className="text-[10px] text-white/30 truncate">
                    <span style={{ color: colorForName(m.reply_to_author) }} className="font-semibold">{m.reply_to_author}</span>
                    {': '}
                    {m.reply_to_body?.slice(0, 55)}{(m.reply_to_body?.length ?? 0) > 55 ? '…' : ''}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-[12px] font-semibold leading-none shrink-0" style={{ color: isMe ? '#34d399' : color }}>
                    {m.author_name}
                  </span>
                  <span className="text-[10px] text-white/20 shrink-0 tabular-nums">{formatTime(m.created_at)}</span>
                </div>

                <div className={`flex items-center gap-1 shrink-0 transition-opacity duration-100 ${isHovered || showingReactPicker ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <div className="relative" ref={showingReactPicker ? reactionPickerRef : undefined}>
                    <button
                      onClick={() => setShowReactionFor(showingReactPicker ? null : m.id)}
                      title="Reaccionar"
                      className="w-6 h-6 flex items-center justify-center rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-[11px] transition-colors"
                    >
                      😊
                    </button>

                    {showingReactPicker && (
                    <div className="absolute right-full mr-1 top-0 z-50 bg-[#1a1d27] border border-white/[0.1] rounded-xl p-2 shadow-2xl shadow-black/60" style={{ width: '190px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px' }}>
                          {REACTION_EMOJIS.map((em) => (
                            <button
                              key={em}
                              onClick={() => sendReaction(m.id, em)}
                              className="w-8 h-8 flex items-center justify-center text-base rounded-lg hover:bg-white/10 transition-colors"
                            >
                              {em}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => { setReplyTo(m); inputRef.current?.focus(); }}
                    title="Responder"
                    className="w-6 h-6 flex items-center justify-center rounded-md bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/40 hover:text-white/70 transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M1 5L6 1v2.5C10 3.5 11 6 11 9c-1.5-2-3-3-5-3V8.5L1 5z"/>
                    </svg>
                  </button>
                </div>
              </div>

              <p className="text-[13px] text-white/80 break-words leading-relaxed mt-0.5">{m.body}</p>

              {msgReactions.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {msgReactions.map((r) => {
                    const iMine = r.authors.includes(userName);
                    return (
                      <button
                        key={r.emoji}
                        onClick={() => sendReaction(m.id, r.emoji)}
                        title={r.authors.join(', ')}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border transition-all ${
                          iMine
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                            : 'border-white/[0.08] bg-white/[0.04] text-white/50 hover:border-white/20 hover:bg-white/[0.08]'
                        }`}
                      >
                        <span>{r.emoji}</span>
                        <span className="tabular-nums font-medium">{r.authors.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Reply preview bar ──────────────────────────────── */}
      {replyTo && (
        <div className="shrink-0 mx-3 mb-1 px-3 py-2 bg-white/[0.04] border border-white/[0.06] rounded-lg flex items-center gap-2">
          <div className="w-0.5 h-6 rounded-full bg-emerald-400/50 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-semibold" style={{ color: colorForName(replyTo.author_name) }}>
              {replyTo.author_name}
            </span>
            <p className="text-[10px] text-white/30 truncate">{replyTo.body}</p>
          </div>
          <button
            onClick={() => setReplyTo(null)}
            className="text-white/20 hover:text-white/60 transition-colors shrink-0 text-sm leading-none"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Input area ─────────────────────────────────────── */}
      <div className="p-3 shrink-0 relative">
        {showPicker && (
          <div
            ref={pickerRef}
            className="absolute bottom-full left-3 mb-2 bg-[#1a1d27] border border-white/[0.1] rounded-xl p-3 shadow-2xl shadow-black/60 z-40"
          >
            <div className="grid grid-cols-6 gap-1">
              {PICKER_EMOJIS.map((em) => (
                <button
                  key={em}
                  onClick={() => { setDraft((d) => d + em); inputRef.current?.focus(); }}
                  className="w-9 h-9 flex items-center justify-center text-xl rounded-lg hover:bg-white/10 transition-colors"
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 bg-[#1a1d27] border border-white/[0.08] rounded-xl px-2 py-1.5 focus-within:border-emerald-500/40 transition-colors">
          <button
            type="button"
            onClick={() => setShowPicker((p) => !p)}
            className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-base transition-colors ${
              showPicker ? 'bg-emerald-500/15 text-emerald-400' : 'hover:bg-white/[0.06] text-white/30 hover:text-white/60'
            }`}
            title="Emojis"
          >
            😊
          </button>

          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={replyTo ? `↩ ${replyTo.author_name}…` : 'Escribe algo…'}
            maxLength={500}
            className="flex-1 bg-transparent text-[13px] text-white/80 placeholder:text-white/20 outline-none min-w-0 py-1"
          />

          <button
            type="button"
            onClick={sendMessage}
            disabled={!draft.trim()}
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-[#0f1117] hover:bg-emerald-400 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
            title="Enviar"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M1.5 7.5L14 2 9 8l5 6-13-6.5z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
