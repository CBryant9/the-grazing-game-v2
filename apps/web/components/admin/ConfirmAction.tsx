'use client';

import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import styles from './admin.module.css';

export interface ConfirmActionProps {
  /** The button's words, for example "Turn on". */
  label: string;
  /** What will happen, in plain words, shown before the admin confirms. */
  explain: string;
  endpoint:
    | '/api/admin/switches'
    | '/api/admin/settings'
    | '/api/admin/users'
    | '/api/admin/notifications';
  body: Record<string, unknown>;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A button that asks first. Pressing it shows what it will do and two buttons, Yes and Cancel.
 * Only Yes sends the request (a POST with a JSON body: the server's CSRF rule). The answer shows
 * right here, and the page's numbers are read again.
 */
export function ConfirmAction({
  label,
  explain,
  endpoint,
  body,
  danger,
  disabled,
}: ConfirmActionProps) {
  const router = useRouter();
  const [step, setStep] = useState<'idle' | 'asking' | 'busy'>('idle');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  async function send() {
    setStep('busy');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: unknown;
        changed?: unknown;
      } | null;
      if (!res.ok) {
        setMessage({
          ok: false,
          text:
            typeof data?.error === 'string'
              ? data.error
              : 'That did not work. Nothing was changed.',
        });
      } else {
        setMessage({
          ok: true,
          text: data?.changed === false ? 'It was already like that.' : 'Done.',
        });
        router.refresh();
      }
    } catch {
      setMessage({ ok: false, text: 'The server could not be reached. Nothing was changed.' });
    }
    setStep('idle');
    queueMicrotask(() => openRef.current?.focus());
  }

  return (
    <div>
      <div className={styles.btnrow}>
        <button
          ref={openRef}
          type="button"
          className={danger ? styles.danger : undefined}
          disabled={disabled || step !== 'idle'}
          aria-expanded={step !== 'idle'}
          aria-controls={id}
          onClick={() => {
            setMessage(null);
            setStep('asking');
            queueMicrotask(() => first.current?.focus());
          }}
        >
          {label}
        </button>
      </div>
      {step !== 'idle' && (
        <div className={styles.confirm} id={id} role="group" aria-label={`Confirm: ${label}`}>
          <p>{explain}</p>
          <div className={styles.btnrow}>
            <button
              ref={first}
              type="button"
              className={`${styles.primary} ${danger ? styles.danger : ''}`}
              disabled={step === 'busy'}
              onClick={() => void send()}
            >
              {step === 'busy' ? 'Working' : 'Yes, do it'}
            </button>
            <button
              type="button"
              disabled={step === 'busy'}
              onClick={() => {
                setStep('idle');
                queueMicrotask(() => openRef.current?.focus());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {message && (
        <p
          className={`${styles.status} ${message.ok ? styles.ok : styles.bad}`}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
