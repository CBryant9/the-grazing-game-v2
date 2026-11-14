'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import styles from '@/components/admin/admin.module.css';

export type FieldSpec =
  | {
      kind: 'text' | 'textarea' | 'date';
      name: string;
      label: string;
      value?: string | null;
      max?: number;
      help?: string;
      required?: boolean;
    }
  | {
      kind: 'number';
      name: string;
      label: string;
      value?: number | null;
      min?: number;
      max?: number;
      help?: string;
      required?: boolean;
    }
  | {
      kind: 'select';
      name: string;
      label: string;
      value?: string | null;
      options: { value: string; label: string }[];
      help?: string;
    }
  | { kind: 'check'; name: string; label: string; value?: boolean; help?: string }
  | {
      kind: 'checks';
      name: string;
      label: string;
      value?: string[];
      options: { value: string; label: string }[];
      help?: string;
    }
  | { kind: 'file'; name: string; label: string; accept: string; help?: string };

/** Reads a chosen file as base64 (the bytes only; the server decides what it is). */
async function base64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * One admin form for the ad screens. It sends `{ action, ...fixed, ...fields }` to the ad route as
 * JSON, shows the answer in plain words right here, and reads the page's numbers again. An empty
 * text or number field is sent as null. A chosen file is sent as base64 under `upload`.
 */
export function AdminForm({
  action,
  fixed = {},
  fields,
  submit = 'Save',
  goTo,
  nest,
}: {
  action: string;
  fixed?: Record<string, unknown>;
  fields: FieldSpec[];
  submit?: string;
  /** After a save, go to this path with `{id}` replaced by the id the server answers. */
  goTo?: string;
  /** Put the fields in an object of this name, for example `settings`. */
  nest?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { action, ...fixed };
      const target: Record<string, unknown> = nest ? {} : body;
      if (nest) body[nest] = target;
      for (const f of fields) {
        const el = form.elements.namedItem(f.name);
        if (f.kind === 'checks') {
          target[f.name] = [
            ...form.querySelectorAll<HTMLInputElement>(`input[name="${f.name}"]:checked`),
          ].map((i) => i.value);
        } else if (f.kind === 'check') {
          target[f.name] = (el as HTMLInputElement).checked;
        } else if (f.kind === 'file') {
          const file = (el as HTMLInputElement).files?.[0];
          if (file) body.upload = { data: await base64(file) };
        } else if (f.kind === 'number') {
          const v = (el as HTMLInputElement).value.trim();
          target[f.name] = v === '' ? null : Number(v);
        } else {
          const v = (el as HTMLInputElement).value;
          target[f.name] = v === '' ? null : v;
        }
      }
      const res = await fetch('/api/ads/admin', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: unknown; id?: unknown } | null;
      if (!res.ok) {
        setMessage({
          ok: false,
          text:
            typeof data?.error === 'string'
              ? data.error
              : 'That did not save. Nothing was changed.',
        });
      } else {
        setMessage({ ok: true, text: 'Saved.' });
        if (goTo && typeof data?.id === 'string') router.push(goTo.replace('{id}', data.id));
        else router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: 'The server could not be reached. Nothing was changed.' });
    }
    setBusy(false);
  }

  return (
    <form className={styles.list} onSubmit={(e) => void onSubmit(e)}>
      {fields.map((f) => {
        const id = `f-${action}-${f.name}-${String((fixed as { id?: unknown }).id ?? 'new')}`;
        return (
          <div className={styles.field} key={f.name}>
            {f.kind === 'check' ? (
              <label className={styles.choice}>
                <input type="checkbox" name={f.name} defaultChecked={f.value ?? false} />
                <span>{f.label}</span>
              </label>
            ) : f.kind === 'checks' ? (
              <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
                <legend className={styles.label}>{f.label}</legend>
                {f.options.map((o) => (
                  <label className={styles.choice} key={o.value}>
                    <input
                      type="checkbox"
                      name={f.name}
                      value={o.value}
                      defaultChecked={f.value?.includes(o.value)}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <>
                <label htmlFor={id}>{f.label}</label>
                {f.kind === 'textarea' ? (
                  <textarea
                    id={id}
                    name={f.name}
                    defaultValue={f.value ?? ''}
                    maxLength={f.max}
                    rows={3}
                  />
                ) : f.kind === 'select' ? (
                  <select id={id} name={f.name} defaultValue={f.value ?? ''}>
                    {f.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : f.kind === 'file' ? (
                  <input id={id} name={f.name} type="file" accept={f.accept} />
                ) : f.kind === 'number' ? (
                  <input
                    id={id}
                    name={f.name}
                    type="number"
                    inputMode="numeric"
                    defaultValue={f.value ?? ''}
                    min={f.min}
                    max={f.max}
                    required={f.required}
                  />
                ) : (
                  <input
                    id={id}
                    name={f.name}
                    type={f.kind === 'date' ? 'date' : 'text'}
                    defaultValue={f.value ?? ''}
                    maxLength={f.max}
                    required={f.required}
                  />
                )}
              </>
            )}
            {f.help && <p className={styles.muted}>{f.help}</p>}
          </div>
        );
      })}
      <div className={styles.btnrow}>
        <button type="submit" className={styles.primary} disabled={busy}>
          {busy ? 'Saving' : submit}
        </button>
      </div>
      {message && (
        <p
          className={`${styles.status} ${message.ok ? styles.ok : styles.bad}`}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
