'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { PlaybackState, Track } from '@/lib/types';
import Waveform from './Waveform';

type PlayerProps = {
  roomId: string;
  userName: string;
  tracks: Track[];
};

const DRIFT_THRESHOLD_SECONDS = 0.6;
const VOLUME_STORAGE_KEY = 'frecuencia_volume';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function Player({ roomId, userName, tracks: propTracks }: PlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [localProgress, setLocalProgress] = useState(0);
  const [localDuration, setLocalDuration] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  // Local ordered tracks (for drag & drop)
  const [orderedTracks, setOrderedTracks] = useState<Track[]>(propTracks);

  // Drag & drop
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLLIElement | null>(null);

  const clockOffsetRef = useRef(0);
  const playbackRef = useRef<PlaybackState | null>(null);
  const lastAppliedUpdatedAtRef = useRef<string | null>(null);

  // Keep orderedTracks in sync with propTracks (merge from server, preserve local order for items that exist)
  useEffect(() => {
    setOrderedTracks((prev) => {
      const prevIds = prev.map((t) => t.id);
      const incomingIds = propTracks.map((t) => t.id);

      // New tracks from server not yet in local order
      const newTracks = propTracks.filter((t) => !prevIds.includes(t.id));
      // Remove deleted tracks
      const surviving = prev.filter((t) => incomingIds.includes(t.id));
      // Update metadata (title, etc.) for existing tracks
      const updated = surviving.map(
        (t) => propTracks.find((p) => p.id === t.id) ?? t
      );
      return [...updated, ...newTracks];
    });
  }, [propTracks]);

  useEffect(() => {
    playbackRef.current = playback;
  }, [playback]);

  const currentTrack =
    orderedTracks.find((t) => t.id === playback?.current_track_id) || null;

  // ── Clock sync ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function syncClock() {
      let bestOffset = 0;
      let bestRoundTrip = Infinity;
      for (let i = 0; i < 3; i++) {
        const t0 = Date.now();
        const { data, error } = await supabase.rpc('server_now');
        const t1 = Date.now();
        if (error || !data) continue;
        const roundTrip = t1 - t0;
        const serverTimeMs = new Date(data as string).getTime();
        const offset = serverTimeMs - (t0 + roundTrip / 2);
        if (roundTrip < bestRoundTrip) { bestRoundTrip = roundTrip; bestOffset = offset; }
      }
      if (!cancelled) clockOffsetRef.current = bestOffset;
    }
    syncClock();
    return () => { cancelled = true; };
  }, []);

  function getServerNow() { return Date.now() + clockOffsetRef.current; }

  // ── Volume ───────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(VOLUME_STORAGE_KEY);
    if (saved !== null) { const v = parseFloat(saved); if (!isNaN(v)) setVolume(v); }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = muted ? 0 : volume;
  }, [volume, muted]);

  function handleVolumeChange(newVolume: number) {
    setVolume(newVolume);
    setMuted(false);
    localStorage.setItem(VOLUME_STORAGE_KEY, String(newVolume));
  }

  function toggleMute() { setMuted((m) => !m); }

  // ── Playback state: load + realtime ──────────────────────────────────
  useEffect(() => {
    let active = true;
    async function loadState() {
      const { data } = await supabase
        .from('playback_state').select('*').eq('room_id', roomId).maybeSingle();
      if (active && data) setPlayback(data as PlaybackState);
    }
    loadState();

    const channel = supabase
      .channel(`playback:${roomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'playback_state', filter: `room_id=eq.${roomId}` },
        (payload) => { if (payload.new) setPlayback(payload.new as PlaybackState); })
      .subscribe();

    return () => { active = false; supabase.removeChannel(channel); };
  }, [roomId]);

  // ── Apply play/pause + drift correction ──────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playback || !currentTrack) return;

    const incomingUpdatedAt = playback.updated_at;
    if (incomingUpdatedAt === lastAppliedUpdatedAtRef.current) {
      if (playback.is_playing) { if (audio.paused) audio.play().catch(() => setIsBuffering(true)); }
      else if (!audio.paused) { audio.pause(); }
      return;
    }
    lastAppliedUpdatedAtRef.current = incomingUpdatedAt;

    const elapsedSinceUpdate = playback.is_playing
      ? (getServerNow() - new Date(playback.updated_at).getTime()) / 1000
      : 0;
    const targetPosition = Math.max(0, playback.position_seconds + elapsedSinceUpdate);
    const drift = Math.abs(audio.currentTime - targetPosition);
    if (drift > DRIFT_THRESHOLD_SECONDS) audio.currentTime = targetPosition;

    if (playback.is_playing) { if (audio.paused) audio.play().catch(() => setIsBuffering(true)); }
    else if (!audio.paused) { audio.pause(); }
  }, [playback, currentTrack]);

  // ── Broadcast helper ──────────────────────────────────────────────────
  const broadcastState = useCallback(
    async (nextState: { current_track_id: string | null; is_playing: boolean; position_seconds: number }) => {
      await supabase.from('playback_state').upsert({ room_id: roomId, ...nextState, updated_by: userName });
    },
    [roomId, userName]
  );

  // ── Controls ──────────────────────────────────────────────────────────
  function handlePlayPause() {
    if (!currentTrack) return;
    const audio = audioRef.current;
    const current = playbackRef.current;
    const nextPlaying = !(current?.is_playing ?? false);
    const position = audio?.currentTime ?? 0;
    const nextState: PlaybackState = { room_id: roomId, current_track_id: currentTrack.id, is_playing: nextPlaying, position_seconds: position, updated_at: '', updated_by: userName };
    setPlayback(nextState);
    playbackRef.current = nextState;
    broadcastState({ current_track_id: currentTrack.id, is_playing: nextPlaying, position_seconds: position });
  }

  function handleSeek(ratio: number) {
    const audio = audioRef.current;
    if (!audio || !localDuration || !currentTrack) return;
    const newTime = ratio * localDuration;
    audio.currentTime = newTime;
    const current = playbackRef.current;
    broadcastState({ current_track_id: currentTrack.id, is_playing: current?.is_playing ?? false, position_seconds: newTime });
  }

  function selectTrack(track: Track) {
    const nextState: PlaybackState = { room_id: roomId, current_track_id: track.id, is_playing: true, position_seconds: 0, updated_at: '', updated_by: userName };
    setPlayback(nextState);
    playbackRef.current = nextState;
    broadcastState({ current_track_id: track.id, is_playing: true, position_seconds: 0 });
  }

  function handleNext() {
    if (!currentTrack) return;
    const idx = orderedTracks.findIndex((t) => t.id === currentTrack.id);
    const next = orderedTracks[idx + 1];
    if (next) selectTrack(next);
  }

  // ── Audio element events ──────────────────────────────────────────────
  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setLocalProgress(audio.duration ? audio.currentTime / audio.duration : 0);
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setLocalDuration(audio.duration);
    setIsBuffering(false);
    audio.volume = muted ? 0 : volume;
  }

  function handleEnded() { handleNext(); }

  // ── Audio source resolution ───────────────────────────────────────────
  const audioSrc = currentTrack
    ? supabase.storage.from('tracks').getPublicUrl(currentTrack.file_path).data.publicUrl
    : undefined;

  const effectiveVolume = muted ? 0 : volume;

  // ── Drag & drop reordering ────────────────────────────────────────────
  function handleDragStart(e: React.DragEvent<HTMLLIElement>, index: number) {
    setDragIndex(index);
    dragNodeRef.current = e.currentTarget;
    e.dataTransfer.effectAllowed = 'move';
    // Slight delay so the ghost image looks nice
    setTimeout(() => { if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.4'; }, 0);
  }

  function handleDragEnter(index: number) {
    if (dragIndex === null || dragIndex === index) return;
    setDragOverIndex(index);
  }

  function handleDragOver(e: React.DragEvent<HTMLLIElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e: React.DragEvent<HTMLLIElement>, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) return;

    setOrderedTracks((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(dropIndex, 0, moved);

      // Persist new positions to Supabase (fire & forget)
      next.forEach((t, i) => {
        supabase.from('tracks').update({ position: i }).eq('id', t.id).then(() => {});
      });

      return next;
    });

    setDragIndex(null);
    setDragOverIndex(null);
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '';
    dragNodeRef.current = null;
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '';
    dragNodeRef.current = null;
  }

  return (
    <div className="border border-line bg-panel">
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onWaiting={() => setIsBuffering(true)}
        onPlaying={() => setIsBuffering(false)}
        preload="auto"
      />

      {/* Now playing */}
      <div className="px-4 py-4 sm:px-5 border-b border-line">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-[0.3em] text-mute">
            {currentTrack ? 'Sonando ahora' : 'Nada en reproducción'}
          </span>
          <div className="flex items-center gap-2">
            {isBuffering && (
              <span className="text-[10px] uppercase tracking-widest text-amber animate-blink">
                buffering…
              </span>
            )}
          </div>
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-semibold uppercase truncate text-bone">
          {currentTrack ? currentTrack.title : '—'}
        </h2>
        {currentTrack?.artist && (
          <p className="text-mute text-sm truncate">{currentTrack.artist}</p>
        )}
      </div>

      {/* Waveform / progress */}
      <div className="px-4 py-4 sm:px-5 border-b border-line">
        <Waveform
          progress={localProgress}
          isPlaying={playback?.is_playing ?? false}
          onSeek={currentTrack ? handleSeek : undefined}
        />
        <div className="flex justify-between mt-2 text-[11px] text-mute tabular-nums">
          <span>{formatTime(audioRef.current?.currentTime ?? 0)}</span>
          <span>{formatTime(localDuration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-4 sm:px-5 flex items-center justify-between gap-3">
        <div className="w-24 sm:w-28 shrink-0" />

        <div className="flex items-center justify-center gap-4 sm:gap-6">
          <button
            onClick={handlePlayPause}
            disabled={!currentTrack}
            aria-label={playback?.is_playing ? 'Pausar' : 'Reproducir'}
            className="focus-ring w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-phosphor text-void flex items-center justify-center hover:opacity-90 active:scale-95 transition-all disabled:opacity-30"
          >
            {playback?.is_playing ? (
              <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
                <rect x="3" y="2" width="4" height="14" />
                <rect x="11" y="2" width="4" height="14" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor">
                <path d="M4 2.5v13l11-6.5z" />
              </svg>
            )}
          </button>
          <button
            onClick={handleNext}
            disabled={!currentTrack}
            aria-label="Siguiente canción"
            className="focus-ring w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-bone hover:text-phosphor transition-colors disabled:opacity-30"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M2 2.5v11l8-5.5z" />
              <rect x="11" y="2.5" width="2.5" height="11" />
            </svg>
          </button>
        </div>

        <div className="relative w-24 sm:w-28 shrink-0 flex items-center justify-end gap-2">
          <input
            type="range"
            min={0} max={1} step={0.01}
            value={effectiveVolume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            aria-label="Volumen"
            className="accent-phosphor h-1 w-16 sm:w-20"
          />
          <button
            onClick={toggleMute}
            aria-label={muted ? 'Activar sonido' : 'Silenciar'}
            className="focus-ring w-8 h-8 flex items-center justify-center text-mute hover:text-phosphor transition-colors shrink-0"
          >
            {muted || effectiveVolume === 0 ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 7h3l4-3v12l-4-3H2V7z" />
                <path d="M13 7l5 6M18 7l-5 6" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            ) : effectiveVolume < 0.5 ? (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 7h3l4-3v12l-4-3H2V7z" />
                <path d="M13 8a3 3 0 010 4" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2 7h3l4-3v12l-4-3H2V7z" />
                <path d="M13 6a5 5 0 010 8M15.5 4a8.5 8.5 0 010 12" stroke="currentColor" strokeWidth="1.5" fill="none" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Playlist with drag & drop */}
      <div className="border-t border-line">
        <div className="px-4 py-2 sm:px-5 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-[0.3em] text-mute">
            Cola — {orderedTracks.length}{' '}
            {orderedTracks.length === 1 ? 'canción' : 'canciones'}
          </span>
          {orderedTracks.length > 1 && (
            <span className="text-[10px] text-mute/60 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" opacity="0.5">
                <rect y="2" width="16" height="2" rx="1"/>
                <rect y="7" width="16" height="2" rx="1"/>
                <rect y="12" width="16" height="2" rx="1"/>
              </svg>
              Arrastra para reordenar
            </span>
          )}
        </div>
        <ul className="max-h-56 overflow-y-auto">
          {orderedTracks.length === 0 && (
            <li className="px-4 py-3 sm:px-5 text-mute text-xs italic">
              Sube el primer MP3 para empezar.
            </li>
          )}
          {orderedTracks.map((t, index) => {
            const active = t.id === currentTrack?.id;
            const isDragging = dragIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <li
                key={t.id}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnter={() => handleDragEnter(index)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`border-b border-line/50 transition-all ${
                  isDragOver && !isDragging
                    ? 'border-t-2 border-t-phosphor'
                    : ''
                }`}
              >
                <button
                  onClick={() => selectTrack(t)}
                  className={`focus-ring w-full text-left px-4 py-2.5 sm:px-5 flex items-center gap-3 transition-colors hover:bg-void ${
                    active ? 'bg-void' : ''
                  } ${isDragging ? 'opacity-40' : ''}`}
                >
                  {/* Drag handle */}
                  <span
                    className="text-mute/40 hover:text-mute cursor-grab active:cursor-grabbing shrink-0 select-none"
                    title="Arrastra para reordenar"
                  >
                    <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                      <circle cx="3" cy="2.5" r="1.2"/>
                      <circle cx="7" cy="2.5" r="1.2"/>
                      <circle cx="3" cy="7" r="1.2"/>
                      <circle cx="7" cy="7" r="1.2"/>
                      <circle cx="3" cy="11.5" r="1.2"/>
                      <circle cx="7" cy="11.5" r="1.2"/>
                    </svg>
                  </span>

                  {/* Title */}
                  <span className={`truncate text-sm flex-1 ${active ? 'text-phosphor' : 'text-bone'}`}>
                    {t.title}
                    {t.artist && <span className="text-mute"> — {t.artist}</span>}
                  </span>

                  {/* Playing indicator */}
                  {active && playback?.is_playing && (
                    <span className="flex gap-[2px] items-end h-3 ml-1 shrink-0">
                      <span className="w-[2px] h-2 bg-phosphor animate-blink" />
                      <span className="w-[2px] h-3 bg-phosphor animate-blink" style={{ animationDelay: '0.2s' }} />
                      <span className="w-[2px] h-1.5 bg-phosphor animate-blink" style={{ animationDelay: '0.4s' }} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
