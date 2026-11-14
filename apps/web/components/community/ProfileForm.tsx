'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DISTRICTS, DISTRICT_IDS } from '@gg/shared';
import styles from './community.module.css';
import { photoToBase64, useSend } from './send';

export interface ProfileInit {
  displayName: string;
  bio: string;
  town: string;
  district: string;
  farms: '' | 'yes' | 'no';
  enterprise: string;
  sizeBand: string;
  yearsFarming: string;
  farmRole: string;
  realFarmName: string;
  privacy: 'public' | 'followers' | 'private';
  farmView: 'public' | 'followers' | 'off';
  tickerOptIn: boolean;
  hideTicker: boolean;
  links: Record<string, string>;
  experience: { role: string; enterprise: string; place: string; from: string; to: string }[];
  education: { course: string; provider: string; year: string }[];
}

const LINKS: [string, string][] = [
  ['website', 'Website'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['x', 'X'],
  ['youtube', 'YouTube'],
  ['tiktok', 'TikTok'],
];
const BANDS: [string, string][] = [
  ['under_100', 'Under 100 ha'],
  ['100_500', '100 to 500 ha'],
  ['500_2000', '500 to 2,000 ha'],
  ['2000_10000', '2,000 to 10,000 ha'],
  ['over_10000', 'Over 10,000 ha'],
];

const num = (s: string): number | null => (s.trim() === '' ? null : Number(s));

/** Edit your own profile and privacy. Every field is checked again on the server. */
export function ProfileForm({ init }: { init: ProfileInit }) {
  const router = useRouter();
  const { busy, message, done, send } = useSend();
  const [f, setF] = useState<ProfileInit>(init);
  const up = <K extends keyof ProfileInit>(k: K, v: ProfileInit[K]): void =>
    setF((s) => ({ ...s, [k]: v }));

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const r = await send('/api/community/profile', {
      displayName: f.displayName,
      bio: f.bio,
      town: f.town,
      district: f.district || null,
      farms: f.farms === '' ? null : f.farms === 'yes',
      enterprise: f.enterprise,
      farmSizeBand: f.sizeBand || null,
      yearsFarming: num(f.yearsFarming),
      farmRole: f.farmRole,
      realFarmName: f.realFarmName,
      privacyProfile: f.privacy,
      privacyFarmView: f.farmView,
      tickerOptIn: f.tickerOptIn,
      hideTicker: f.hideTicker,
      links: f.links,
      experience: f.experience.map((x) => ({
        role: x.role,
        enterprise: x.enterprise,
        place: x.place,
        from: num(x.from),
        to: num(x.to),
      })),
      education: f.education.map((x) => ({
        course: x.course,
        provider: x.provider,
        year: num(x.year),
      })),
    });
    if (r.ok) router.refresh();
  };

  const text = (id: string, label: string, k: keyof ProfileInit, max: number, hint?: string) => (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        maxLength={max}
        value={String(f[k] ?? '')}
        onChange={(e) => up(k, e.target.value as never)}
      />
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );

  return (
    <form className={styles.stack} onSubmit={(e) => void save(e)} aria-label="Edit your profile">
      <fieldset className={styles.card}>
        <legend className={`px ${styles.h2}`}>About you</legend>
        {text('pf-name', 'Display name', 'displayName', 50)}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-bio">
            Short bio
          </label>
          <textarea
            id="pf-bio"
            className={styles.input}
            rows={3}
            maxLength={500}
            value={f.bio}
            onChange={(e) => up('bio', e.target.value)}
          />
        </div>
        {text('pf-town', 'Town or district name', 'town', 60, 'Never an address.')}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-district">
            District
          </label>
          <select
            id="pf-district"
            className={styles.input}
            value={f.district}
            onChange={(e) => up('district', e.target.value)}
          >
            <option value="">Not shown</option>
            {DISTRICT_IDS.map((d) => (
              <option key={d} value={d}>
                {DISTRICTS[d].name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-farms">
            Do you farm?
          </label>
          <select
            id="pf-farms"
            className={styles.input}
            value={f.farms}
            onChange={(e) => up('farms', e.target.value as ProfileInit['farms'])}
          >
            <option value="">Not shown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
        {text('pf-ent', 'What you farm', 'enterprise', 60)}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-size">
            Farm size
          </label>
          <select
            id="pf-size"
            className={styles.input}
            value={f.sizeBand}
            onChange={(e) => up('sizeBand', e.target.value)}
          >
            <option value="">Not shown</option>
            {BANDS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-years">
            Years farming
          </label>
          <input
            id="pf-years"
            className={styles.input}
            inputMode="numeric"
            maxLength={2}
            value={f.yearsFarming}
            onChange={(e) => up('yearsFarming', e.target.value.replace(/\D/g, ''))}
          />
        </div>
        {text('pf-role', 'Your role', 'farmRole', 60)}
        {text('pf-farm', 'Farm name (if you have one)', 'realFarmName', 80)}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={`px ${styles.h2}`}>Links</legend>
        <p className={styles.hint}>Start each with https://. Leave blank to show none.</p>
        {LINKS.map(([k, l]) => (
          <div key={k} className={styles.field}>
            <label className={styles.label} htmlFor={`pf-l-${k}`}>
              {l}
            </label>
            <input
              id={`pf-l-${k}`}
              className={styles.input}
              type="url"
              inputMode="url"
              maxLength={300}
              placeholder="https://"
              value={f.links[k] ?? ''}
              onChange={(e) => setF((s) => ({ ...s, links: { ...s.links, [k]: e.target.value } }))}
            />
          </div>
        ))}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={`px ${styles.h2}`}>Experience</legend>
        {f.experience.map((x, i) => (
          <div key={i} className={styles.sub}>
            {(['role', 'enterprise', 'place'] as const).map((k) => (
              <div key={k} className={styles.field}>
                <label className={styles.label} htmlFor={`pf-x-${i}-${k}`}>
                  {k === 'role' ? 'Job title' : k === 'enterprise' ? 'Enterprise' : 'Place'}
                </label>
                <input
                  id={`pf-x-${i}-${k}`}
                  className={styles.input}
                  maxLength={80}
                  value={x[k]}
                  onChange={(e) =>
                    setF((s) => ({
                      ...s,
                      experience: s.experience.map((y, j) =>
                        j === i ? { ...y, [k]: e.target.value } : y,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <div className={styles.two}>
              {(['from', 'to'] as const).map((k) => (
                <div key={k} className={styles.field}>
                  <label className={styles.label} htmlFor={`pf-x-${i}-${k}`}>
                    {k === 'from' ? 'From (year)' : 'To (year)'}
                  </label>
                  <input
                    id={`pf-x-${i}-${k}`}
                    className={styles.input}
                    inputMode="numeric"
                    maxLength={4}
                    value={x[k]}
                    onChange={(e) =>
                      setF((s) => ({
                        ...s,
                        experience: s.experience.map((y, j) =>
                          j === i ? { ...y, [k]: e.target.value.replace(/\D/g, '') } : y,
                        ),
                      }))
                    }
                  />
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                setF((s) => ({ ...s, experience: s.experience.filter((_, j) => j !== i) }))
              }
            >
              Remove this job
            </button>
          </div>
        ))}
        {f.experience.length < 10 && (
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setF((s) => ({
                ...s,
                experience: [
                  ...s.experience,
                  { role: '', enterprise: '', place: '', from: '', to: '' },
                ],
              }))
            }
          >
            Add a job
          </button>
        )}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={`px ${styles.h2}`}>Courses</legend>
        <p className={styles.hint}>For example Grazing for Profit, RCS, TAFE or university.</p>
        {f.education.map((x, i) => (
          <div key={i} className={styles.sub}>
            {(['course', 'provider'] as const).map((k) => (
              <div key={k} className={styles.field}>
                <label className={styles.label} htmlFor={`pf-e-${i}-${k}`}>
                  {k === 'course' ? 'Course' : 'Provider'}
                </label>
                <input
                  id={`pf-e-${i}-${k}`}
                  className={styles.input}
                  maxLength={120}
                  value={x[k]}
                  onChange={(e) =>
                    setF((s) => ({
                      ...s,
                      education: s.education.map((y, j) =>
                        j === i ? { ...y, [k]: e.target.value } : y,
                      ),
                    }))
                  }
                />
              </div>
            ))}
            <div className={styles.field}>
              <label className={styles.label} htmlFor={`pf-e-${i}-year`}>
                Year
              </label>
              <input
                id={`pf-e-${i}-year`}
                className={styles.input}
                inputMode="numeric"
                maxLength={4}
                value={x.year}
                onChange={(e) =>
                  setF((s) => ({
                    ...s,
                    education: s.education.map((y, j) =>
                      j === i ? { ...y, year: e.target.value.replace(/\D/g, '') } : y,
                    ),
                  }))
                }
              />
            </div>
            <button
              type="button"
              className="btn ghost"
              onClick={() =>
                setF((s) => ({ ...s, education: s.education.filter((_, j) => j !== i) }))
              }
            >
              Remove this course
            </button>
          </div>
        ))}
        {f.education.length < 10 && (
          <button
            type="button"
            className="btn ghost"
            onClick={() =>
              setF((s) => ({
                ...s,
                education: [...s.education, { course: '', provider: '', year: '' }],
              }))
            }
          >
            Add a course
          </button>
        )}
      </fieldset>

      <fieldset className={styles.card}>
        <legend className={`px ${styles.h2}`}>Privacy</legend>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-priv">
            Who can see your profile
          </label>
          <select
            id="pf-priv"
            className={styles.input}
            value={f.privacy}
            onChange={(e) => up('privacy', e.target.value as ProfileInit['privacy'])}
          >
            <option value="public">Everyone</option>
            <option value="followers">Followers only (they ask, you accept)</option>
            <option value="private">Only you (others see your name and photo)</option>
          </select>
          <p className={styles.hint}>
            Others always see your username, display name and photo. A private profile can not be
            followed.
          </p>
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="pf-fv">
            Who can look at your Daily Farm
          </label>
          <select
            id="pf-fv"
            className={styles.input}
            value={f.farmView}
            onChange={(e) => up('farmView', e.target.value as ProfileInit['farmView'])}
          >
            <option value="public">Everyone</option>
            <option value="followers">Followers only</option>
            <option value="off">No one</option>
          </select>
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={f.tickerOptIn}
            onChange={(e) => up('tickerOptIn', e.target.checked)}
          />
          <span>Show what I do on the live activity ticker</span>
        </label>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={f.hideTicker}
            onChange={(e) => up('hideTicker', e.target.checked)}
          />
          <span>Hide the ticker for me</span>
        </label>
      </fieldset>

      <div className={styles.row}>
        <button type="submit" className="btn coral" disabled={busy}>
          {busy ? 'Saving...' : 'Save profile'}
        </button>
      </div>
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
      {done && !message && (
        <p role="status" className={styles.ok}>
          Saved.
        </p>
      )}
    </form>
  );
}

/** Choose, replace or remove the profile photo. It waits for a check; only you see it until then. */
export function AvatarForm({
  status,
  has,
}: {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  has: boolean;
}) {
  const router = useRouter();
  const { busy, message, send } = useSend();
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className={styles.card}>
      <h2 className={`px ${styles.h2}`}>Profile photo</h2>
      <p className={styles.hint}>
        {status === 'pending' &&
          'Your photo is waiting for a check. Only you can see it until then.'}
        {status === 'approved' && 'Your photo has been checked and others can see it.'}
        {status === 'rejected' && 'Your last photo did not pass the check. Choose a different one.'}
        {status === 'none' &&
          'JPEG, PNG or WebP. Each photo is checked before anyone else sees it.'}
      </p>
      <label className={styles.label} htmlFor="avatar-file">
        Choose a photo
      </label>
      <input
        id="avatar-file"
        className={styles.input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setNote(null);
          void photoToBase64(file, 512).then((data) =>
            send<{ status: string }>('/api/community/avatar', { action: 'set', data }).then((r) => {
              if (r.ok) {
                setNote(
                  r.data?.status === 'approved'
                    ? 'Your photo is up.'
                    : 'Got it. Your photo is waiting for a check. Only you can see it until then.',
                );
                router.refresh();
              }
            }),
          );
        }}
      />
      {has && (
        <div className={styles.row}>
          <button
            type="button"
            className="btn ghost"
            disabled={busy}
            onClick={() =>
              void send('/api/community/avatar', { action: 'clear' }).then((r) => {
                if (r.ok) router.refresh();
              })
            }
          >
            Remove my photo
          </button>
        </div>
      )}
      {message && (
        <p role="alert" className={styles.err}>
          {message}
        </p>
      )}
      {note && (
        <p role="status" className={styles.ok}>
          {note}
        </p>
      )}
    </div>
  );
}
