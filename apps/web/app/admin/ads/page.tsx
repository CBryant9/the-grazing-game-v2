import Link from 'next/link';
import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { SlotSettings } from '@/components/ads/SlotSettings';
import { requireAdmin } from '@/server/admin/page';
import { listSwitches } from '@/server/admin/store';
import { listSlots } from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

const pct = (clicks: number, views: number): string =>
  views > 0 ? `${((clicks / views) * 100).toFixed(1)}%` : 'none yet';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const [slots, switches] = await Promise.all([
    listSlots(page.deps.sql),
    listSwitches(page.deps.sql),
  ]);
  const on = (k: string): boolean => switches.find((s) => s.key === k)?.enabled === true;
  return (
    <>
      <h1 className={styles.h1}>Ads and sponsors</h1>
      <p className={styles.lede}>
        Every ad slot is off until you turn it on here. A slot shows only when the master ads switch
        and the slot&rsquo;s own switch are both on (video slots also need Video ads, the phone and
        PC banners also need Banner ads). With no campaign running, a slot shows a house ad if you
        have made one, and nothing otherwise.
      </p>
      <nav className={styles.btnrow} aria-label="Ads">
        <Link href="/admin/ads/campaigns">Campaigns and house ads</Link>
        <Link href="/admin/ads/sponsors">Sponsors</Link>
        <Link href="/admin/ads/stats">Views and clicks</Link>
        <Link href="/admin/switches">Feature switches</Link>
      </nav>

      <section className={styles.card} aria-labelledby="sw">
        <h2 id="sw" className={styles.h2}>
          Switches that sit above the slots
        </h2>
        <ul className={styles.list}>
          {(
            [
              ['ads', 'Ads (master)'],
              ['banner_ads', 'Banner ads'],
              ['video_ads', 'Video ads'],
              ['adsense', 'Google AdSense'],
            ] as const
          ).map(([k, label]) => (
            <li key={k}>
              {label}: <b>{on(k) ? 'On' : 'Off'}</b>
            </li>
          ))}
        </ul>
        <p className={styles.muted}>
          Change these on the Feature switches page. Google AdSense does nothing yet: the switch is
          built, but no Google code is loaded, no publisher or unit id is kept, and it needs a
          cookie and consent banner and your AdSense account before it can be used. No game video
          ads (H5 Games Ads) are used.
        </p>
      </section>

      <ul className={styles.list}>
        {slots.map((s) => (
          <li key={s.id} className={styles.card}>
            <div className={styles.rowhead}>
              <span className={styles.name}>{s.label}</span>
              <code className={styles.mono}>{s.id}</code>
              <span className={`${styles.chip} ${s.enabled ? styles.on : ''}`}>
                {s.enabled ? 'On' : 'Off'}
              </span>
              {!s.placed && <span className={styles.chip}>No place for it yet</span>}
            </div>
            {!s.placed && <p className={styles.muted}>{s.notPlacedWhy}</p>}
            <p className={styles.muted}>
              Campaigns running now: {s.liveCampaigns}. Last 30 days: {s.views30} views,{' '}
              {s.clicks30} clicks (click rate {pct(s.clicks30, s.views30)}).
              {s.needs
                ? ` Also needs the ${s.needs === 'banner_ads' ? 'Banner ads' : 'Video ads'} switch.`
                : ''}
            </p>
            <ConfirmAction
              label={s.enabled ? 'Turn off' : 'Turn on'}
              endpoint="/api/ads/admin"
              body={{ action: 'slot_set', slot: s.id, enabled: !s.enabled }}
              explain={`${s.enabled ? 'Turn off' : 'Turn on'} ${s.label}? ${
                s.enabled
                  ? 'Players stop seeing ads in this slot.'
                  : 'Players start seeing ads in this slot, if the switches above it are on and a campaign or house ad is running.'
              } This is recorded in the audit log.`}
            />
            <SlotSettings slot={s} />
          </li>
        ))}
      </ul>
    </>
  );
}
