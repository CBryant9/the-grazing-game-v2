import Link from 'next/link';
import { notFound } from 'next/navigation';
import styles from '@/components/admin/admin.module.css';
import { ConfirmAction } from '@/components/admin/ConfirmAction';
import { AdPreview } from '@/components/ads/AdPreview';
import { AdminForm, type FieldSpec } from '@/components/ads/AdminForm';
import { campaignFields } from '@/components/ads/CampaignFields';
import { requireAdmin } from '@/server/admin/page';
import { isUuid } from '@/server/admin/store';
import {
  listCampaigns,
  listCreatives,
  listSponsors,
  type CreativeRow,
} from '@/server/ads/adminStore';

export const dynamic = 'force-dynamic';

function creativeFields(c: CreativeRow | null): FieldSpec[] {
  const fields: FieldSpec[] = [];
  if (!c) {
    fields.push({
      kind: 'select',
      name: 'kind',
      label: 'Kind',
      value: 'image',
      options: [
        { value: 'image', label: 'Picture (banner, card or post)' },
        { value: 'logo', label: 'Logo (strips and the challenge sponsor)' },
        { value: 'video', label: 'Video (an MP4 up to 30 seconds and 3 MB)' },
        { value: 'text', label: 'Words only' },
      ],
    });
  }
  fields.push(
    { kind: 'text', name: 'headline', label: 'Headline', value: c?.headline, max: 80 },
    { kind: 'text', name: 'body', label: 'One line', value: c?.body, max: 200 },
    { kind: 'text', name: 'linkUrl', label: 'Link (https only)', value: c?.linkUrl, max: 500 },
  );
  if (!c || c.kind !== 'text') {
    fields.push(
      {
        kind: 'text',
        name: 'alt',
        label: 'What the picture shows (read out by a screen reader)',
        value: c?.alt,
        max: 120,
      },
      {
        kind: 'file',
        name: 'file',
        label: c ? 'Replace the file (optional)' : 'File',
        accept: 'image/jpeg,image/png,image/webp,video/mp4',
        help: 'A JPEG, PNG or WebP picture up to 1 MB, or an MP4 video up to 30 seconds and 3 MB. The server looks inside the file: SVG, HTML and anything else is refused.',
      },
    );
  }
  fields.push({ kind: 'check', name: 'active', label: 'This ad is on', value: c?.active ?? true });
  return fields;
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const page = await requireAdmin();
  if (!page) return null;
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [campaign] = await listCampaigns(page.deps.sql, id);
  if (!campaign) notFound();
  const [creatives, sponsors] = await Promise.all([
    listCreatives(page.deps.sql, id),
    listSponsors(page.deps.sql),
  ]);
  return (
    <>
      <p>
        <Link href="/admin/ads/campaigns">Back to campaigns</Link>
      </p>
      <h1 className={styles.h1}>{campaign.name}</h1>
      <p className={styles.lede}>
        {campaign.isHouse ? 'House ad' : `Sponsor: ${campaign.sponsorName}`}. {campaign.views} views
        and {campaign.clicks} clicks in all.{' '}
        <Link href={`/admin/ads/campaigns/${id}/report`}>Sponsor report</Link>
      </p>

      <section className={styles.card} aria-labelledby="edit">
        <h2 id="edit" className={styles.h2}>
          Campaign
        </h2>
        <AdminForm
          action="campaign_save"
          fixed={{ id }}
          fields={campaignFields({ sponsors, campaign })}
        />
      </section>

      <section aria-labelledby="ads">
        <h2 id="ads" className={styles.h2}>
          Ads in this campaign
        </h2>
        <ul className={styles.list}>
          {creatives.map((c) => (
            <li key={c.id} className={styles.card}>
              <div className={styles.rowhead}>
                <span className={styles.name}>
                  {c.kind}: {c.headline ?? c.body ?? 'no words'}
                </span>
                <span className={`${styles.chip} ${c.active ? styles.on : ''}`}>
                  {c.active ? 'On' : 'Off'}
                </span>
                {c.durationS && <span className={styles.chip}>{c.durationS} s</span>}
              </div>
              <AdPreview
                creative={c}
                sponsor={campaign.sponsorName}
                house={campaign.isHouse}
                slots={campaign.slots}
              />
              <details>
                <summary>Edit this ad</summary>
                <AdminForm
                  action="creative_save"
                  fixed={{ id: c.id, campaignId: id, kind: c.kind }}
                  fields={creativeFields(c)}
                />
              </details>
              <ConfirmAction
                label="Delete this ad"
                danger
                endpoint="/api/ads/admin"
                body={{ action: 'creative_delete', id: c.id }}
                explain="Delete this ad and its file? This can not be undone."
              />
            </li>
          ))}
          {creatives.length === 0 && <li className={styles.muted}>No ads in this campaign yet.</li>}
        </ul>
        <div className={styles.card}>
          <h3 className={styles.h2}>Add an ad</h3>
          <AdminForm
            action="creative_save"
            fixed={{ campaignId: id }}
            fields={creativeFields(null)}
            submit="Add ad"
          />
        </div>
      </section>

      <section className={styles.card} aria-labelledby="del">
        <h2 id="del" className={styles.h2}>
          Delete this campaign
        </h2>
        <p className={styles.muted}>
          A campaign that has had views or clicks can not be deleted, because its report needs them.
          Turn it off instead.
        </p>
        <ConfirmAction
          label="Delete campaign"
          danger
          endpoint="/api/ads/admin"
          body={{ action: 'campaign_delete', id }}
          explain="Delete this campaign and all its ads? This can not be undone."
        />
      </section>
    </>
  );
}
