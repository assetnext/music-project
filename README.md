# Frecuencia 🎵

Escuchen la misma canción exactamente al mismo tiempo. Sin cuentas, sin instalación.

---

## Setup rápido

### 1. Clonar e instalar
```bash
npm install
```

### 2. Configurar Supabase
Copia `.env.example` como `.env.local` y completa con tus datos:
```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aqui
```

### 3. Correr el schema en Supabase
En tu Supabase Dashboard → SQL Editor → New query, pega y ejecuta **todo** el contenido de `supabase-schema.sql`.

### 4. ⚠️ Migración obligatoria para el chat (replies)
Después del schema principal, corre también `migration-chat-reply.sql`.
Sin este paso el reply de mensajes no funciona.

```sql
-- Contenido de migration-chat-reply.sql
alter table chat_messages
  add column if not exists reply_to_id uuid references chat_messages(id) on delete set null,
  add column if not exists reply_to_author text,
  add column if not exists reply_to_body text;
```

### 5. Levantar el proyecto
```bash
npm run dev
```

---

## Features

- 🎵 **Reproducción sincronizada** — todos escuchan exactamente lo mismo, corrige desfase de reloj entre dispositivos
- 💬 **Chat en tiempo real** — con emojis, replies y reacciones (❤️ 😂 🔥 👏 y más)
- 👥 **Presencia** — ves quién está en la sala, con aviso cuando alguien entra o sale
- 📁 **Subir MP3** — cualquiera en la sala puede agregar canciones a la cola
- 🔊 **Control de volumen personal** — no afecta a los demás

---

## Cómo funciona el chat

- **Responder**: hover sobre un mensaje → botón ↩ → escribe y enviás
- **Reaccionar**: hover sobre un mensaje → botón 😊 → elegí emoji
- **Emojis en el input**: botón 😊 abajo a la izquierda del input
- **Avisos de entrada**: aparece una línea en el chat cuando alguien nuevo se une (requiere al menos 2 personas en la sala)
