/**
 * YouTube track utilities.
 *
 * Tracks sourced from YouTube are stored in the DB with:
 *   file_path = "yt:<youtube_url>"
 *
 * For playback we use the cobalt.tools public API to obtain an
 * audio-only stream URL (no video, no embed).
 */

export const YT_PREFIX = 'yt:';

/** Returns true if the track's file_path encodes a YouTube URL. */
export function isYouTubeTrack(filePath: string): boolean {
  return filePath.startsWith(YT_PREFIX);
}

/** Extracts the raw YouTube URL from a `yt:<url>` file_path. */
export function extractYouTubeUrl(filePath: string): string {
  return filePath.slice(YT_PREFIX.length);
}

/** Returns a human-readable label for a YouTube URL (video ID). */
export function youtubeLabel(url: string): string {
  try {
    const u = new URL(url);
    const id =
      u.searchParams.get('v') ||
      u.pathname.split('/').filter(Boolean).pop() ||
      'video';
    return `YT: ${id}`;
  } catch {
    return 'YouTube track';
  }
}

/**
 * Validates whether a string looks like a YouTube URL.
 */
export function isValidYouTubeUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return (
      (u.hostname === 'www.youtube.com' ||
        u.hostname === 'youtube.com' ||
        u.hostname === 'youtu.be' ||
        u.hostname === 'm.youtube.com') &&
      (u.searchParams.has('v') ||
        u.pathname.startsWith('/watch') ||
        u.hostname === 'youtu.be')
    );
  } catch {
    return false;
  }
}

/**
 * Fetches an audio-only stream URL via the cobalt.tools public API.
 *
 * cobalt.tools is a free, open-source media downloader service.
 * We request "audio" mode so we get an MP3/Opus stream, never video.
 *
 * Returns the stream URL on success, or null if the service is
 * unavailable / the video is restricted.
 */
export async function resolveYouTubeAudioUrl(
  youtubeUrl: string
): Promise<string | null> {
  try {
    // Try cobalt.tools API (v7 JSON API)
    const res = await fetch('https://api.cobalt.tools/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        url: youtubeUrl,
        downloadMode: 'audio',
        audioFormat: 'mp3',
        filenameStyle: 'basic',
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();

    // cobalt returns { status: "tunnel" | "redirect" | "picker" | "error", url?: string }
    if (
      (json.status === 'tunnel' || json.status === 'redirect' || json.status === 'stream') &&
      json.url
    ) {
      return json.url as string;
    }

    return null;
  } catch {
    return null;
  }
}
