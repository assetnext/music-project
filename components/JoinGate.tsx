'use client';

import { useState } from 'react';

type JoinGateProps = {
  roomName: string;
  hostName: string;
  onJoin: (name: string) => void;
};

export default function JoinGate({ roomName, hostName, onJoin }: JoinGateProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Escribe tu nombre para entrar.');
      return;
    }
    onJoin(trimmed);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-6 text-phosphor text-xs tracking-[0.3em] uppercase">
          <span className="inline-block w-2 h-2 rounded-full bg-phosphor animate-blink" />
          te están esperando
        </div>
        <h1 className="font-display text-4xl font-semibold uppercase mb-2 text-bone leading-tight">
          {roomName}
        </h1>
        <p className="text-mute text-sm mb-8">
          {hostName} te invitó a escuchar en vivo.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="joinName"
              className="block text-xs uppercase tracking-widest text-mute mb-2"
            >
              Tu nombre
            </label>
            <input
              id="joinName"
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Vale"
              maxLength={24}
              className="focus-ring w-full bg-panel border border-line px-4 py-3 text-bone placeholder:text-mute/50 outline-none transition-colors focus:border-phosphor"
            />
          </div>
          {error && <p className="text-danger text-sm">{error}</p>}
          <button
            type="submit"
            className="focus-ring w-full bg-phosphor text-void font-display font-semibold uppercase tracking-wide py-3 transition-opacity hover:opacity-90"
          >
            Entrar a la sala
          </button>
        </form>
      </div>
    </main>
  );
}
