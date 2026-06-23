'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function HomePage() {
  const router = useRouter();
  const [hostName, setHostName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleCreateRoom(e: React.FormEvent) {
    e.preventDefault();
    if (!hostName.trim()) {
      setError('Escribe tu nombre primero.');
      return;
    }
    setError('');
    setLoading(true);

    const code = generateCode();
    const { data, error: insertError } = await supabase
      .from('rooms')
      .insert({
        code,
        name: roomName.trim() || `Sala de ${hostName.trim()}`,
        host_name: hostName.trim(),
      })
      .select()
      .single();

    if (insertError || !data) {
      setError('No se pudo crear la sala. Revisa la configuración de Supabase.');
      setLoading(false);
      return;
    }

    sessionStorage.setItem('frecuencia_username', hostName.trim());
    router.push(`/room/${data.id}`);
  }

  return (
    <main className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
      {/* Línea de fondo tipo osciloscopio */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.08]">
        <svg viewBox="0 0 1200 300" className="w-[140%] max-w-none">
          <path
            d="M0,150 Q50,40 100,150 T200,150 T300,150 T400,150 T500,150 T600,150 T700,150 T800,150 T900,150 T1000,150 T1100,150 T1200,150"
            stroke="#9bff6e"
            strokeWidth="2"
            fill="none"
          />
        </svg>
      </div>

      <div className="relative w-full max-w-md">
        {/* Eyebrow tipo display de equipo */}
        <div className="flex items-center gap-2 mb-6 text-phosphor text-xs tracking-[0.3em] uppercase">
          <span className="inline-block w-2 h-2 rounded-full bg-phosphor animate-blink" />
          señal en vivo
        </div>

        <h1 className="font-display text-6xl sm:text-7xl font-semibold uppercase leading-[0.9] mb-3 text-bone">
          Frecuencia
        </h1>
        <p className="text-mute text-sm mb-10 max-w-sm leading-relaxed">
          Crea una sala, comparte el link con tu amigo, suban canciones y
          escúchenlas exactamente al mismo tiempo. Con chat.
        </p>

        <form onSubmit={handleCreateRoom} className="space-y-4">
          <div>
            <label
              htmlFor="hostName"
              className="block text-xs uppercase tracking-widest text-mute mb-2"
            >
              Tu nombre
            </label>
            <input
              id="hostName"
              type="text"
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="ej. Mauro"
              maxLength={24}
              className="focus-ring w-full bg-panel border border-line px-4 py-3 text-bone placeholder:text-mute/50 outline-none transition-colors focus:border-phosphor"
            />
          </div>

          <div>
            <label
              htmlFor="roomName"
              className="block text-xs uppercase tracking-widest text-mute mb-2"
            >
              Nombre de la sala (opcional)
            </label>
            <input
              id="roomName"
              type="text"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder="ej. Viernes de vinilo"
              maxLength={40}
              className="focus-ring w-full bg-panel border border-line px-4 py-3 text-bone placeholder:text-mute/50 outline-none transition-colors focus:border-phosphor"
            />
          </div>

          {error && (
            <p className="text-danger text-sm border border-danger/30 bg-danger/5 px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="focus-ring w-full bg-phosphor text-void font-display font-semibold uppercase tracking-wide py-3 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Sintonizando…' : 'Crear sala'}
          </button>
        </form>

        <p className="text-mute text-xs mt-8 leading-relaxed">
          No hace falta cuenta. Al crear la sala obtienes un link único —
          compártelo y quien lo abra se une en vivo.
        </p>
      </div>
    </main>
  );
}
