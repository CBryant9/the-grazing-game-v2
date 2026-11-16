'use client';

import { useState } from 'react';
import { ConfirmAction } from './ConfirmAction';
import styles from './admin.module.css';

const DAYS = [1, 3, 7, 14, 30] as const;
const endpoint = '/api/admin/moderation' as const;

/** The moderator's choices for one report. Each asks first and says what it will do. */
export function ReportActions({
  reportId,
  targetType,
  canRemove,
  canAct,
}: {
  reportId: string;
  targetType: 'post' | 'comment' | 'profile' | 'group';
  canRemove: boolean;
  canAct: boolean;
}) {
  const [days, setDays] = useState<number>(7);
  const removeWords =
    targetType === 'profile'
      ? 'Clear this profile’s bio and display name?'
      : `Remove this ${targetType}? Nobody but its author will see that it was removed.`;
  return (
    <div className={styles.list}>
      <ConfirmAction
        label="Keep"
        endpoint={endpoint}
        body={{ reportId, action: 'keep' }}
        explain="Keep the content and close this report and any other open report on it? The author is not told."
      />
      {canRemove && (
        <ConfirmAction
          label={targetType === 'profile' ? 'Clear bio and name' : 'Remove'}
          danger
          endpoint={endpoint}
          body={{ reportId, action: 'remove' }}
          explain={`${removeWords} The author is told, with the reason given. Other open reports on it close too. This is recorded in the audit log.`}
        />
      )}
      {canAct && (
        <>
          <ConfirmAction
            label="Warn"
            endpoint={endpoint}
            body={{ reportId, action: 'warn' }}
            explain="Send the author a warning? The content stays. The report and any other open report on it close. This is recorded in the audit log."
          />
          <div className={styles.inline}>
            <div className={styles.field}>
              <label htmlFor={`days-${reportId}`}>Suspend for</label>
              <select
                id={`days-${reportId}`}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                {DAYS.map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'day' : 'days'}
                  </option>
                ))}
              </select>
            </div>
            <ConfirmAction
              label="Suspend"
              danger
              endpoint={endpoint}
              body={{ reportId, action: 'suspend', days }}
              explain={`Suspend the author for ${days} ${days === 1 ? 'day' : 'days'}? Their sessions end now and they are told. This is recorded in the audit log.`}
            />
          </div>
          <ConfirmAction
            label="Ban"
            danger
            endpoint={endpoint}
            body={{ reportId, action: 'ban' }}
            explain="Ban the author with no end date? Their sessions end now. You can lift it later from the Users page. This is recorded in the audit log."
          />
        </>
      )}
    </div>
  );
}
