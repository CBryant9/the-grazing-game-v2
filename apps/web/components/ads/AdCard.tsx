import type { ReactNode } from 'react';
import type { WireAd } from '@/lib/ads/api';
import type { AdShape, AdSize } from '@/lib/ads/registry';
import styles from './ads.module.css';

/**
 * One ad, drawn. Plain markup with no hooks and no script, so the admin preview (a server page)
 * and the game (a client component) draw exactly the same thing. It always carries its label,
 * `Ad` or `Sponsored`. A link opens in a new tab through the server's click route, with
 * `rel="sponsored noopener"`. The box is the slot's reserved size, so nothing moves when the
 * picture loads.
 */

const FRAME: Record<AdShape, string> = {
  banner: styles.banner!,
  cards: styles.card!,
  card: styles.card!,
  post: styles.post!,
  logos: styles.logo!,
  video: '',
};

export function AdCard({
  ad,
  shape,
  size,
  close,
  fixedHeight,
}: {
  ad: WireAd;
  shape: AdShape;
  size: AdSize;
  /** A close button, for the timed banners. */
  close?: ReactNode;
  /** A banner is exactly its height; a card is at least its height. */
  fixedHeight?: boolean;
}) {
  const alt = ad.alt ?? ad.headline ?? ad.sponsor ?? 'Advertisement';
  const image = ad.mediaUrl && ad.kind !== 'text' && ad.kind !== 'video';
  const line = ad.headline ?? ad.body;
  const wholePicture = shape === 'banner' && image;
  const inner = (
    <>
      {wholePicture ? (
        // The picture is the banner. Its own label sits over a corner.
        <>
          <span className={styles.chip}>{ad.label}</span>
          {/* eslint-disable-next-line @next/next/no-img-element -- a small ad picture from our own route, with its size reserved */}
          <img className={styles.img} src={ad.mediaUrl!} alt={alt} width={size.w} height={size.h} />
        </>
      ) : (
        <>
          {image && shape !== 'banner' && (
            <span
              className={styles.pic}
              style={{
                display: 'block',
                height: shape === 'post' ? undefined : Math.round(size.h * 0.6),
                minHeight: shape === 'post' ? size.h : undefined,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a small ad picture from our own route, with its size reserved */}
              <img
                className={styles.img}
                src={ad.mediaUrl!}
                alt={alt}
                width={size.w}
                height={size.h}
              />
            </span>
          )}
          {shape !== 'logos' && (
            <span className={styles.text}>
              <span className={styles.tag}>{ad.label}</span>
              {ad.sponsor && (
                <b className={shape === 'banner' ? styles.clip : undefined}>{ad.sponsor}</b>
              )}
              {line && <span className={shape === 'banner' ? styles.clip : undefined}>{line}</span>}
              {ad.headline && ad.body && shape !== 'banner' && <span>{ad.body}</span>}
            </span>
          )}
          {shape === 'logos' && (
            <>
              <span className={styles.chip}>{ad.label}</span>
              {ad.mediaUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a small ad picture from our own route, with its size reserved
                <img
                  className={styles.img}
                  src={ad.mediaUrl}
                  alt={alt}
                  width={size.w}
                  height={size.h}
                />
              )}
            </>
          )}
        </>
      )}
    </>
  );
  const frame = ad.href ? (
    <a
      className={styles.link}
      href={ad.href}
      target="_blank"
      rel="sponsored noopener"
      aria-label={`${ad.label}: ${ad.sponsor ?? alt}. Opens in a new tab.`}
    >
      {inner}
    </a>
  ) : (
    <div className={styles.link}>{inner}</div>
  );
  return (
    <div
      className={`${styles.box} ${FRAME[shape]}`}
      style={
        fixedHeight
          ? { maxWidth: size.w, height: size.h, marginInline: 'auto' }
          : { maxWidth: size.w, minHeight: size.h }
      }
      data-ad-label={ad.label}
    >
      {frame}
      {close}
    </div>
  );
}
