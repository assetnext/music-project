'use client';

import { useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type UploadButtonProps = {
  roomId: string;
  userName: string;
  nextPosition: number;
  onUploaded: () => void;
};

function stripExtension(filename: string): string {
  return filename.replace(/\.[^/.]+$/, '');
}

export default function UploadButton({
  roomId,
  userName,
  nextPosition,
  onUploaded,
}: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState('');

  // ── File upload ─────────────────────────────────────────────────────
  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError('');
    setUploading(true);

    const fileArray = Array.from(files).filter(
      (f) => f.type.startsWith('audio/') || f.name.toLowerCase().endsWith('.mp3')
    );

    if (fileArray.length === 0) {
      setError('Selecciona archivos de audio (MP3, etc).');
      setUploading(false);
      return;
    }

    for (let i = 0; i < fileArray.length; i++) {
      const file = fileArray[i];
      setProgressLabel(`Subiendo ${i + 1}/${fileArray.length}…`);

      const safeName = `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
      const filePath = `${roomId}/${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from('tracks')
        .upload(filePath, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        setError(`No se pudo subir "${file.name}": ${uploadError.message}`);
        continue;
      }

      await supabase.from('tracks').insert({
        room_id: roomId,
        title: stripExtension(file.name),
        artist: null,
        file_path: filePath,
        uploaded_by: userName,
        position: nextPosition + i,
      });
    }

    setUploading(false);
    setProgressLabel('');
    if (inputRef.current) inputRef.current.value = '';
    onUploaded();
  }

  return (
    <div className="space-y-2">
      {/* Action buttons row */}
      <div>
        {/* MP3 upload */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          <button
            onClick={() => {
              inputRef.current?.click();
            }}
            disabled={uploading}
            className="focus-ring w-full border border-dashed border-line hover:border-phosphor px-3 py-3 text-xs uppercase tracking-widest text-mute hover:text-phosphor transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <svg width="13" height="13" viewBox="0 0 14 14" fill="currentColor">
              <path d="M7 1l3.5 3.5-1 1L7.5 3.5V9h-1V3.5L4.5 5.5l-1-1L7 1z" />
              <path d="M2 11h10v1.5H2z" />
            </svg>
            {uploading ? progressLabel || 'Subiendo…' : 'Subir MP3'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-danger text-xs border border-danger/30 bg-danger/5 px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
