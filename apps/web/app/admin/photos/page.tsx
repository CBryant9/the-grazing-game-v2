import styles from '@/components/admin/admin.module.css';
import communityStyles from '@/components/community/community.module.css';
import { PhotoDecision } from '@/components/community/PhotoDecision';
import { requireAdmin } from '@/server/admin/page';
import { pendingPhotos } from '@/server/community/photos';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const page = await requireAdmin();
  if (!page) return null;
  const queue = await pendingPhotos(page.deps.sql);
  return (
    <>
      <h1 className={styles.h1}>Photo queue</h1>
      <p className={styles.lede}>
        Photos wait here until a person approves them, or until an image-check service is set up and
        passes them. Nobody but the author sees a photo before it is approved. Approving is tied to
        the exact file shown: if the file changes while you look, nothing is approved.
      </p>
      {queue.length === 0 ? (
        <div className={styles.card}>
          <p className={styles.muted}>No photos are waiting.</p>
        </div>
      ) : (
        queue.map((p) => (
          <div key={`${p.kind}-${p.row}`} className={styles.card}>
            <p>
              <b>{p.kind === 'avatar' ? 'Profile photo' : 'Post photo'}</b> from @{p.who}
            </p>
            {p.file ? (
              // Served by the admin preview route, only while it waits and only as a real picture.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={communityStyles.queueimg}
                src={`/api/admin/photo-preview?kind=${p.kind}&row=${p.row}`}
                alt={`Photo from ${p.who}`}
                loading="lazy"
              />
            ) : (
              <p className={styles.muted}>The file could not be read, so it can not be approved.</p>
            )}
            {p.file && (
              <PhotoDecision
                kind={p.kind}
                row={p.row}
                objectId={p.file.id}
                updatedAt={p.file.updatedAt}
                version={p.file.version}
              />
            )}
          </div>
        ))
      )}
    </>
  );
}
