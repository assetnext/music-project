'use client';

import { colorForName } from '@/lib/types';

type PresenceBarProps = {
  names: string[];
  maxVisible?: number;
};

export default function PresenceBar({ names, maxVisible = 4 }: PresenceBarProps) {
  const unique = Array.from(new Set(names));
  const visible = unique.slice(0, maxVisible);
  const overflow = unique.length - visible.length;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <div className="flex -space-x-2 shrink-0">
        {visible.map((name) => {
          const color = colorForName(name);
          return (
            <div key={name} className="relative" title={name}>
              <span
                className="absolute inset-0 rounded-full animate-pulseRing"
                style={{ backgroundColor: color }}
              />
              <div
                className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-display font-semibold uppercase border-2 border-void"
                style={{ backgroundColor: color, color: '#0a0b0a' }}
              >
                {name.slice(0, 2)}
              </div>
            </div>
          );
        })}
        {overflow > 0 && (
          <div
            className="relative w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-[11px] font-display font-semibold border-2 border-void bg-line text-bone"
            title={unique.slice(maxVisible).join(', ')}
          >
            +{overflow}
          </div>
        )}
      </div>
      <span className="text-[11px] sm:text-xs text-mute uppercase tracking-widest whitespace-nowrap">
        {unique.length} {unique.length === 1 ? 'oyente' : 'oyentes'}
      </span>
    </div>
  );
}
