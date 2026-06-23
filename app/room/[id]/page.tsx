'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Room, Track } from '@/lib/types';
import Player from '@/components/Player';
import ChatPanel from '@/components/ChatPanel';
import UploadButton from '@/components/UploadButton';
import PresenceBar from '@/components/PresenceBar';
import JoinGate from '@/components/JoinGate';
import ToastStack, { ToastItem } from '@/components/ToastStack';

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [userName, setUserName] = useState<string | null>(null);
  const [onlineNames, setOnlineNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [joinEvents, setJoinEvents] = useState<{ name: string; ts: number }[]>([]);

  const previousNamesRef = useRef<Set<string> | null>(null);
  // Track which names we've already announced as joined to avoid duplicates
  const announcedJoinsRef = useRef<Set<string>>(new Set());
  // Cooldown: don't re-announce the same name within 5 seconds
  const joinCooldownRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const saved = sessionStorage.getItem('frecuencia_username');
    if (saved) setUserName(saved);
  }, []);

  const fetchTracks = useCallback(async () => {
    const { data } = await supabase
      .from('tracks')
      .select('*')
      .eq('room_id', roomId)
      .order('position', { ascending: true });
    if (data) setTracks(data as Track[]);
  }, [roomId]);

  useEffect(() => {
    let active = true;
    async function loadRoom() {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        setNotFound(true);
      } else {
        setRoom(data as Room);
      }
      setLoading(false);
    }
    loadRoom();
    return () => { active = false; };
  }, [roomId]);

  useEffect(() => {
    if (!room) return;
    fetchTracks();

    const channel = supabase
      .channel(`tracks:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tracks', filter: `room_id=eq.${roomId}` }, () => fetchTracks())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room, roomId, fetchTracks]);

  function pushToast(text: string, kind: 'join' | 'leave') {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, text, kind }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }

  function pushJoinEvent(name: string) {
    const now = Date.now();
    const lastAnnounced = joinCooldownRef.current.get(name) ?? 0;
    // Only announce if 5 seconds have passed since the last announcement for this name
    if (now - lastAnnounced < 5000) return;
    joinCooldownRef.current.set(name, now);
    setJoinEvents((prev) => [...prev, { name, ts: now }]);
  }

  useEffect(() => {
    if (!room || !userName) return;
    previousNamesRef.current = null;
    announcedJoinsRef.current = new Set();
    joinCooldownRef.current = new Map();

    const channel = supabase.channel(`presence:${roomId}`, {
      config: { presence: { key: userName } },
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const currentNames = new Set(Object.keys(state));
        const previousNames = previousNamesRef.current;

        if (previousNames !== null) {
          for (const name of currentNames) {
            if (!previousNames.has(name) && name !== userName) {
              pushToast(`${name} entró a la sala`, 'join');
              pushJoinEvent(name);
            }
          }
          for (const name of previousNames) {
            if (!currentNames.has(name) && name !== userName) {
              pushToast(`${name} salió de la sala`, 'leave');
            }
          }
        }

        previousNamesRef.current = currentNames;
        setOnlineNames(Array.from(currentNames));
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ online_at: new Date().toISOString() });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [room, roomId, userName]);

  function handleJoin(name: string) {
    sessionStorage.setItem('frecuencia_username', name);
    setUserName(name);
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-mute text-xs uppercase tracking-widest animate-blink">Sintonizando…</p>
      </main>
    );
  }

  if (notFound || !room) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <h1 className="font-display text-3xl uppercase font-semibold mb-3 text-bone">Sala no encontrada</h1>
          <p className="text-mute text-sm">Este link no corresponde a ninguna sala activa. Pide a tu amigo que te comparta el link correcto.</p>
        </div>
      </main>
    );
  }

  if (!userName) {
    return <JoinGate roomName={room.name} hostName={room.host_name} onJoin={handleJoin} />;
  }

  return (
    <main className="min-h-screen px-3 py-5 sm:px-8 sm:py-10">
      <ToastStack toasts={toasts} />

      <div className="max-w-5xl mx-auto">
        <header className="flex flex-col gap-4 mb-6 sm:mb-8 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 text-phosphor text-[10px] tracking-[0.3em] uppercase">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-phosphor animate-blink" />
              en vivo
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-semibold uppercase text-bone leading-tight truncate">
              {room.name}
            </h1>
          </div>

          <div className="flex flex-row items-center justify-between gap-3 sm:flex-col sm:items-end">
            <PresenceBar names={onlineNames.length ? onlineNames : [userName]} />
            <button
              onClick={copyLink}
              className="focus-ring shrink-0 text-[10px] sm:text-[11px] uppercase tracking-widest text-mute hover:text-phosphor transition-colors border border-line hover:border-phosphor px-2.5 py-1.5 sm:px-3"
            >
              {linkCopied ? '✓ Copiado' : 'Copiar link'}
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 sm:gap-6 items-start">
          <div className="space-y-5 sm:space-y-6 min-w-0">
            <Player roomId={roomId} userName={userName} tracks={tracks} />
            <UploadButton roomId={roomId} userName={userName} nextPosition={tracks.length} onUploaded={fetchTracks} />
          </div>

          <div className="h-[360px] sm:h-[420px] lg:h-[600px]">
            <ChatPanel roomId={roomId} userName={userName} joinEvents={joinEvents} />
          </div>
        </div>
      </div>
    </main>
  );
}
