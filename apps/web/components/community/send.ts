'use client';

import { useCallback, useState } from 'react';

/**
 * Send a change to a community route and say plainly how it went, right where the player tapped.
 * The browser sends only what the player typed or chose. The server checks everything again and
 * answers with a plain message for a refusal (the words are the server's, never made up here).
 */
export interface Sent<T = Record<string, unknown>> {
  ok: boolean;
  data: T | null;
  message: string | null;
}

export async function sendJson<T = Record<string, unknown>>(
  path: string,
  body: unknown,
): Promise<Sent<T>> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) {
      return {
        ok: false,
        data: null,
        message:
          res.status === 404
            ? 'That is not available any more.'
            : (data?.error ?? 'Something went wrong. Nothing was changed.'),
      };
    }
    return { ok: true, data: data as T, message: null };
  } catch {
    return {
      ok: false,
      data: null,
      message: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

/** A busy flag and a message around `sendJson`. */
export function useSend() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const send = useCallback(async <T>(path: string, body: unknown): Promise<Sent<T>> => {
    setBusy(true);
    setMessage(null);
    const r = await sendJson<T>(path, body);
    setBusy(false);
    setDone(r.ok);
    setMessage(r.message);
    return r;
  }, []);
  return { busy, message, done, send, setMessage };
}

/** The photo as base64 for the server. The browser shrinks it first (this also applies the camera's rotation); the server strips and checks it again whatever arrives. */
export async function photoToBase64(file: File, maxSide: number): Promise<string> {
  let blob: Blob = file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (out) blob = out;
    }
  } catch {
    // The file goes as it is; the server will refuse it if it is not a picture it can use.
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}
