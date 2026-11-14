import type { SlotView } from '@/server/ads/adminStore';
import { AdminForm, type FieldSpec } from './AdminForm';

/** The caps and times of one slot, as a small form. The server checks every number again. */
export function SlotSettings({ slot }: { slot: SlotView }) {
  if (slot.settingKeys.length === 0) return null;
  const fields: FieldSpec[] = slot.settingKeys.map((k) => ({
    kind: 'number',
    name: k.key,
    label: k.label,
    value: typeof slot.settings[k.key] === 'number' ? (slot.settings[k.key] as number) : null,
    min: k.min,
    max: k.max,
    required: true,
  }));
  return (
    <details>
      <summary>Caps and times</summary>
      <AdminForm
        action="slot_set"
        fixed={{ slot: slot.id }}
        nest="settings"
        fields={fields}
        submit="Save caps"
      />
    </details>
  );
}
