'use client';

import { useMemo } from 'react';

type WaveformProps = {
  progress: number; // 0 to 1
  isPlaying: boolean;
  onSeek?: (ratio: number) => void;
  barCount?: number;
};

export default function Waveform({
  progress,
  isPlaying,
  onSeek,
  barCount = 64,
}: WaveformProps) {
  // Alturas pseudo-random pero estables (deterministas) para que no
  // "salte" en cada render.
  const heights = useMemo(() => {
    const arr: number[] = [];
    let seed = 42;
    for (let i = 0; i < barCount; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const rnd = seed / 233280;
      arr.push(0.25 + rnd * 0.75);
    }
    return arr;
  }, [barCount]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(Math.min(1, Math.max(0, ratio)));
  }

  return (
    <div
      onClick={handleClick}
      role={onSeek ? 'slider' : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      className={`flex items-center gap-[2px] h-12 w-full ${
        onSeek ? 'cursor-pointer' : ''
      }`}
    >
      {heights.map((h, i) => {
        const barRatio = i / barCount;
        const active = barRatio <= progress;
        return (
          <div
            key={i}
            className="flex-1 rounded-sm transition-colors duration-150"
            style={{
              height: `${h * 100}%`,
              backgroundColor: active ? '#9bff6e' : '#23261f',
              opacity:
                isPlaying && active && barRatio > progress - 0.02 ? 1 : active ? 0.9 : 1,
            }}
          />
        );
      })}
    </div>
  );
}
