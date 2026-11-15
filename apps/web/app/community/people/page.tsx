import { Empty, PersonRow, SubNav } from '@/components/community/Parts';
import styles from '@/components/community/community.module.css';
import { searchPeople, searchTerm } from '@/server/community/data';
import { requireMember } from '@/server/community/page';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { me, deps } = await requireMember();
  const { q } = await searchParams;
  const typed = typeof q === 'string' ? q.slice(0, 40) : '';
  const term = searchTerm(typed);
  const people = term ? await searchPeople(deps.sql, me.userId, term) : [];
  return (
    <>
      <h1 className={`px ${styles.title}`}>Find people</h1>
      <SubNav here="people" />
      <form className={styles.card} role="search" action="/community/people" method="get">
        <label className={styles.label} htmlFor="people-q">
          Start of a username
        </label>
        <div className={styles.searchform}>
          <input
            id="people-q"
            className={styles.input}
            name="q"
            type="search"
            minLength={2}
            maxLength={20}
            pattern="@?[A-Za-z0-9_]{2,20}"
            autoComplete="off"
            defaultValue={typed}
          />
          <button type="submit" className="btn coral">
            Search
          </button>
        </div>
        <p className={styles.hint}>Two to twenty letters, numbers or underscores.</p>
      </form>
      {typed !== '' && !term && (
        <Empty>Type at least two letters or numbers, with no spaces.</Empty>
      )}
      {term && people.length === 0 && <Empty>No one found. Check the spelling.</Empty>}
      {people.length > 0 && (
        <ul className={styles.people} aria-label="Results">
          {people.map((p) => (
            <PersonRow key={p.id} p={p} />
          ))}
        </ul>
      )}
    </>
  );
}
