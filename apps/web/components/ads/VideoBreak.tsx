'use client';

import { useEffect, useRef, useState } from 'react';
import { reportAd, type WireAd } from '@/lib/ads/api';
import { useSeen } from './useSeen';
import styles from './ads.module.css';

/** Seconds of the video before it can be skipped (PRD 10.1: "Skippable after 5 s"). */
export const SKIP_AFTER_S = 5;
/**
 * The longest the break may hold the player, whatever the video does (a video is up to 30
 * seconds; this leaves room to start). After this the break is over, so a stuck video never
 * traps anyone.
 */
export const BREAK_LIMIT_MS = 40_000;
/** If the video has not started playing by now, the break is dropped. */
export const START_LIMIT_MS = 6_000;

/**
 * The video break between years: a player built here, no third-party player and no outside
 * script. It
 * - starts muted (never autoplays with sound) and has a button for sound, off until asked;
 * - counts down "Skip in 5" by the video's own time, then the button works;
 * - can be used with the keyboard (real buttons, visible focus, 44 px) and read by a screen
 *   reader (a labelled region, a polite note when skipping becomes possible);
 * - is labelled `Ad` or `Sponsored`, and its length is shown;
 * - reports a view when it is playing and on screen, and its end or skip.
 *
 * `onDone` is called once, when the break is over: it ended, it was skipped, it could not play,
 * or it ran out of time.
 */
export function VideoBreak({ ad, onDone }: { ad: WireAd; onDone: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const done = useRef(false);
  const started = useRef(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(ad.durationS ?? 0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  const finish = (how: 'ended' | 'skipped' | 'failed'): void => {
    if (done.current) return;
    done.current = true;
    if (how === 'ended') reportAd(ad.token, 'video_complete');
    if (how === 'skipped') reportAd(ad.token, 'video_skip');
    video.current?.pause();
    onDone();
  };

  useEffect(() => {
    const hard = setTimeout(() => finish('failed'), BREAK_LIMIT_MS);
    const start = setTimeout(() => {
      if (!started.current) finish('failed');
    }, START_LIMIT_MS);
    return () => {
      clearTimeout(hard);
      clearTimeout(start);
    };
    // The timers belong to this ad; `finish` and `started` are read when they fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad.token]);

  useSeen(box, playing, () => reportAd(ad.token, 'view'), ad.token);

  const left = Math.max(0, SKIP_AFTER_S - Math.floor(time));
  const canSkip = left === 0 || (length > 0 && length <= SKIP_AFTER_S && time >= length);
  return (
    <section aria-label={`${ad.label}: video break`}>
      <div className={styles.video} ref={box}>
        {/* A video the player can not play is dropped, never shown as a broken box. */}
        <video
          ref={video}
          src={ad.mediaUrl ?? undefined}
          muted={muted}
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload noplaybackrate noremoteplayback"
          onPlaying={() => {
            started.current = true;
            setPlaying(true);
          }}
          onPause={() => setPlaying(false)}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => setLength(Math.ceil(e.currentTarget.duration) || length)}
          onEnded={() => finish('ended')}
          onError={() => finish('failed')}
          aria-label={ad.alt ?? ad.headline ?? 'Advertisement video'}
        />
        <span className={`${styles.vbadge} ${styles.vleft}`}>
          {ad.label}
          {length > 0
            ? ` 0:${String(Math.max(0, length - Math.floor(time))).padStart(2, '0')}`
            : ''}
        </span>
        <div className={styles.vbar}>
          <button
            type="button"
            className={styles.vbtn}
            aria-pressed={!muted}
            onClick={() => {
              setMuted((m) => !m);
              void video.current?.play().catch(() => undefined);
            }}
          >
            {muted ? 'Sound on' : 'Sound off'}
          </button>
          <button
            type="button"
            className={styles.vbtn}
            disabled={!canSkip}
            onClick={() => finish('skipped')}
          >
            {canSkip ? 'Skip' : `Skip in ${left}`}
          </button>
        </div>
      </div>
      {ad.href && (
        <p className={styles.vnote}>
          <a href={ad.href} target="_blank" rel="sponsored noopener">
            Visit {ad.sponsor ?? 'the sponsor'} (opens in a new tab)
          </a>
        </p>
      )}
      <p className={styles.vnote} role="status">
        {canSkip ? 'You can skip this now.' : ''}
      </p>
    </section>
  );
}
