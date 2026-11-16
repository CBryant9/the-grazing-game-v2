import { AD_SLOTS } from '@gg/shared';
import { SLOTS } from '@/lib/ads/registry';
import type { CampaignRow, SponsorRow } from '@/server/ads/adminStore';
import type { FieldSpec } from './AdminForm';

const STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

/** The campaign form's fields (PRD 11.4): who, dates, who sees it, limits, slots. Plain data, so a server page can build it. */
export function campaignFields(input: {
  sponsors: Pick<SponsorRow, 'id' | 'name'>[];
  campaign?: CampaignRow;
}): FieldSpec[] {
  const c = input.campaign;
  return [
    {
      kind: 'text',
      name: 'name',
      label: 'Campaign name (private)',
      value: c?.name,
      max: 120,
      required: true,
    },
    {
      kind: 'select',
      name: 'sponsorId',
      label: 'Sponsor',
      value: c?.sponsorId ?? '',
      options: [
        { value: '', label: 'None (a house ad)' },
        ...input.sponsors.map((s) => ({ value: s.id, label: s.name })),
      ],
      help: 'Leave on "None" for a house ad: your own business, used to fill empty slots.',
    },
    { kind: 'check', name: 'house', label: 'This is a house ad', value: c?.isHouse ?? false },
    {
      kind: 'date',
      name: 'startDay',
      label: 'First day (Sydney)',
      value: c?.startDay,
      required: true,
    },
    {
      kind: 'date',
      name: 'endDay',
      label: 'Last day (Sydney), included',
      value: c?.endDay,
      help: 'Leave empty for no end.',
    },
    {
      kind: 'select',
      name: 'audience',
      label: 'Who sees it',
      value: c?.audience ?? 'everyone',
      options: [
        { value: 'everyone', label: 'Everyone' },
        { value: 'farmers', label: 'Signed-in players who say they farm' },
      ],
      help: 'Aimed ads are never shown to guests or to anyone under 16.',
    },
    {
      kind: 'checks',
      name: 'states',
      label: 'Only these states (none ticked means all)',
      value: c?.states ?? [],
      options: STATES.map((s) => ({ value: s, label: s })),
    },
    {
      kind: 'number',
      name: 'weight',
      label: 'Weight when several share a slot (1 to 100)',
      value: c?.weight ?? 1,
      min: 1,
      max: 100,
      required: true,
    },
    {
      kind: 'number',
      name: 'maxViewsPerViewerDay',
      label: 'Most views a day for one player (empty for no limit)',
      value: c?.maxViewsPerViewerDay ?? null,
      min: 1,
      max: 1000,
    },
    {
      kind: 'number',
      name: 'maxViews',
      label: 'Stop after this many views in all (empty for no limit)',
      value: c?.maxViews ?? null,
      min: 1,
    },
    {
      kind: 'checks',
      name: 'slots',
      label: 'Slots it runs in',
      value: c?.slots ?? [],
      options: AD_SLOTS.map((id) => ({
        value: id,
        label: `${SLOTS[id].label}${SLOTS[id].placed ? '' : ' (no place for it yet)'}`,
      })),
    },
    {
      kind: 'check',
      name: 'active',
      label: 'Running',
      value: c?.active ?? false,
      help: 'Off means it never shows, whatever its dates say.',
    },
  ];
}
