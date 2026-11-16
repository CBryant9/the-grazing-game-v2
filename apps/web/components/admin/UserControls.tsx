'use client';

import { useState } from 'react';
import { ConfirmAction } from './ConfirmAction';
import styles from './admin.module.css';

const DAYS = [1, 3, 7, 14, 30] as const;
const ROLES = [
  { id: 'player', label: 'Player' },
  { id: 'moderator', label: 'Moderator' },
  { id: 'admin', label: 'Admin' },
] as const;

export interface UserControlsProps {
  userId: string;
  /** This is the signed-in admin's own account. */
  isSelf: boolean;
  hasProfile: boolean;
  state: 'active' | 'suspended' | 'banned';
  role: string | null;
  refusedUnder14: boolean;
}

/** The actions on one account. Each one asks first and says what it will do. */
export function UserControls({
  userId,
  isSelf,
  hasProfile,
  state,
  role,
  refusedUnder14,
}: UserControlsProps) {
  const [days, setDays] = useState<number>(7);
  const [newRole, setNewRole] = useState<string>(role ?? 'player');
  const endpoint = '/api/admin/users' as const;
  return (
    <div className={styles.list}>
      {isSelf && (
        <p className={styles.muted}>
          This is your own account. You can not suspend or ban it or change its role.
        </p>
      )}
      {hasProfile && !isSelf && state === 'active' && (
        <div className={styles.row}>
          <div className={styles.inline}>
            <div className={styles.field}>
              <label htmlFor="suspend-days">Suspend for</label>
              <select
                id="suspend-days"
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
              body={{ userId, action: 'suspend', days }}
              explain={`Suspend this account for ${days} ${days === 1 ? 'day' : 'days'}? They can not use the community while it lasts, and their sessions end now. This is recorded in the audit log.`}
            />
          </div>
        </div>
      )}
      {hasProfile && !isSelf && state !== 'banned' && (
        <ConfirmAction
          label="Ban"
          danger
          endpoint={endpoint}
          body={{ userId, action: 'ban' }}
          explain="Ban this account with no end date? Their sessions end now. The sign-in email is kept only as a one-way hash, so the same address can not sign up again while the ban runs. If the email can not be found when you confirm, the ban still applies but will not survive the player deleting their account and signing up again, and you will be told. You can lift it later. This is recorded in the audit log."
        />
      )}
      {hasProfile && state !== 'active' && (
        <ConfirmAction
          label={state === 'banned' ? 'Lift the ban' : 'Lift the suspension'}
          endpoint={endpoint}
          body={{ userId, action: 'lift' }}
          explain="Lift this now? The account goes back to normal, and the hash kept for a ban is removed. This is recorded in the audit log."
        />
      )}
      {hasProfile && !isSelf && (
        <div className={styles.inline}>
          <div className={styles.field}>
            <label htmlFor="new-role">Role</label>
            <select id="new-role" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <ConfirmAction
            label="Change role"
            endpoint={endpoint}
            disabled={newRole === role}
            body={{ userId, action: 'set_role', role: newRole }}
            explain={`Change this account's role to ${newRole}? ${newRole === 'admin' ? 'An admin can change every switch and setting and act on other accounts.' : 'They lose admin screens if they had them.'} This is recorded in the audit log.`}
          />
        </div>
      )}
      <ConfirmAction
        label="Sign out everywhere"
        endpoint={endpoint}
        body={{ userId, action: 'sign_out_all' }}
        explain="End every sign-in for this account? They will have to sign in again on every device. A device may stay signed in for a short while, until its access runs out. This is recorded in the audit log."
      />
      {refusedUnder14 && (
        <ConfirmAction
          label="Clear the under-14 refusal"
          endpoint={endpoint}
          body={{ userId, action: 'clear_refusal' }}
          explain="Clear the refusal for this sign-in? Use this only for an adult who typed the wrong date of birth. They can then try signing up again. This is recorded in the audit log."
        />
      )}
    </div>
  );
}
