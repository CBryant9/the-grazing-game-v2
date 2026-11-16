import { AD_SLOTS } from '@gg/shared';
import type { WireAd } from '@/lib/ads/api';
import { SLOTS, type AdLayout } from '@/lib/ads/registry';
import type { CreativeRow } from '@/server/ads/adminStore';
import { AdCard } from './AdCard';
import styles from '@/components/admin/admin.module.css';

/**
 * A preview of one creative at the size of each slot it can sit in, on a phone and on a PC, drawn by
 * the same component the game uses, with its label. Nothing here is clickable and nothing here
 * counts a view: an admin looking at a preview is not an audience.
 */
export function AdPreview({
  creative,
  sponsor,
  house,
  slots,
}: {
  creative: CreativeRow;
  sponsor: string | null;
  house: boolean;
  /** The slots the campaign runs in; with none chosen, every slot that can show this kind. */
  slots: readonly string[];
}) {
  const ad: WireAd = {
    token: '',
    creativeId: creative.id,
    kind: creative.kind,
    headline: creative.headline,
    body: creative.body,
    alt: creative.alt,
    sponsor,
    label: house ? 'Ad' : 'Sponsored',
    mediaUrl: creative.hasMedia ? `/api/ads/media/${creative.id}` : null,
    href: null,
    width: creative.width,
    height: creative.height,
    durationS: creative.durationS,
  };
  const chosen = AD_SLOTS.filter((id) =>
    slots.length > 0 ? slots.includes(id) : SLOTS[id].kinds.includes(creative.kind),
  ).filter((id) => SLOTS[id].kinds.includes(creative.kind));
  if (chosen.length === 0) {
    return (
      <p className={styles.muted}>
        None of the slots this campaign runs in can show a {creative.kind} ad, so it will not show.
      </p>
    );
  }
  const layouts: AdLayout[] = ['phone', 'pc'];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {chosen.map((id) => {
        const def = SLOTS[id];
        return (
          <div key={id}>
            <p className={styles.muted}>{def.label}</p>
            {layouts.map((layout) => {
              const size = def.sizes[layout];
              if (!size) return null;
              if (def.video) {
                return (
                  <div key={layout}>
                    <p className={styles.muted}>
                      {layout === 'phone' ? 'On a phone' : 'On a PC'} ({size.w} by {size.h})
                    </p>
                    {ad.mediaUrl && (
                      <video
                        src={ad.mediaUrl}
                        controls
                        muted
                        preload="metadata"
                        style={{ width: '100%', maxWidth: size.w }}
                        aria-label="Video preview"
                      />
                    )}
                  </div>
                );
              }
              return (
                <div key={layout}>
                  <p className={styles.muted}>
                    {layout === 'phone' ? 'On a phone' : 'On a PC'} ({size.w} by {size.h})
                  </p>
                  <AdCard ad={ad} shape={def.shape} size={size} fixedHeight={def.timed} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
