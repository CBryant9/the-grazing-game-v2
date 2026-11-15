import type { GetServerSideProps, PageConfig } from 'next';
import Head from 'next/head';
import { DISTRICTS, DISTRICT_IDS, MODES } from '@gg/shared';
import { BoardTable } from '@/components/boards/BoardTable';
import styles from '@/components/boards/boards.module.css';
import { PublicHeader } from '@/components/site/PublicHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { Ticker } from '@/components/site/Ticker';
import siteStyles from '@/components/site/site.module.css';
import type { BoardPageProps } from '@/server/boards/page';

// No JavaScript is sent to the browser for this page: the filters are a plain form.
export const config: PageConfig = { unstable_runtimeJS: false };

const BOARD_TABS: [string, string][] = [
  ['grazier', 'Score'],
  ['profit_per_ha', 'Profit per ha'],
  ['beef_per_ha', 'Weight gain per ha'],
  ['ground_cover', 'Ground cover'],
  ['days_survived', 'Days survived'],
  ['real_year', 'Real years'],
];
const PERIODS: [string, string][] = [
  ['week', 'This week'],
  ['month', 'This month'],
  ['season', 'This season'],
  ['all', 'All time'],
];

/** Server side only: reads the board for this request (the database's rules decide every row). */
export const getServerSideProps: GetServerSideProps<BoardPageProps> = async ({
  req,
  res,
  query,
}) => {
  const { boardPage } = await import('@/server/boards/page');
  const props = await boardPage(req.cookies, query);
  if (!props) return { notFound: true };
  res.setHeader('Cache-Control', 'private, no-store');
  return { props };
};

function Select({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | null;
  options: [string, string][];
}) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value ?? ''}>
        <option value="">Any</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function LeaderboardsPage(p: BoardPageProps) {
  const q = p.query;
  const tabHref = (board: string): string => {
    const s = new URLSearchParams();
    s.set('board', board);
    for (const [k, v] of [
      ['period', q.period],
      ['mode', q.mode],
      ['district', q.district],
      ['size', q.size],
      ['start', q.start],
      ['enterprise', q.enterprise],
    ] as const) {
      if (v && !(k === 'period' && v === 'all')) s.set(k, v);
    }
    return `/leaderboards?${s.toString()}`;
  };
  return (
    <>
      <Head>
        <title>Leaderboards | The Grazing Game</title>
        <meta
          name="description"
          content="Leaderboards for The Grazing Game: score, profit per ha, weight gain per ha, ground cover, days survived and real years."
        />
      </Head>
      <PublicHeader current="/leaderboards" />
      <main id="main" className={siteStyles.main}>
        <div className="wrap">
          <div className="pagehead">
            <h1>Leaderboards</h1>
            <p>Every farm here was run on the server. Your own row is pinned at the bottom.</p>
          </div>
          <div className={styles.wrap}>
            <nav className={styles.tabs} aria-label="Boards">
              {BOARD_TABS.map(([b, name]) => (
                <a key={b} href={tabHref(b)} aria-current={q.board === b ? 'page' : undefined}>
                  {name}
                </a>
              ))}
            </nav>
            <form method="get" action="/leaderboards" className={styles.filters}>
              <input type="hidden" name="board" value={q.board} />
              {q.board === 'real_year' ? (
                <Select
                  name="year"
                  label="Real year"
                  value={p.view.year === null ? null : String(p.view.year)}
                  options={p.view.years.map((y) => [String(y), String(y)])}
                />
              ) : (
                <label>
                  Period
                  <select name="period" defaultValue={q.period}>
                    {PERIODS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <Select
                name="mode"
                label="Mode"
                value={q.mode}
                options={Object.values(MODES).map((m) => [m.id, m.name])}
              />
              <Select
                name="district"
                label="District"
                value={q.district}
                options={DISTRICT_IDS.map((d) => [d, DISTRICTS[d].name])}
              />
              <Select
                name="size"
                label="Farm size"
                value={q.size}
                options={[
                  ['small', 'Small'],
                  ['medium', 'Medium'],
                  ['large', 'Large'],
                ]}
              />
              <Select
                name="start"
                label="Start"
                value={q.start}
                options={[
                  ['scratch', 'From scratch'],
                  ['running', 'Take over'],
                ]}
              />
              <Select
                name="enterprise"
                label="Enterprise"
                value={q.enterprise}
                options={[
                  ['grazing', 'Grazing'],
                  ['mixed', 'Mixed'],
                ]}
              />
              {p.member && (
                <label className={styles.check}>
                  <input type="checkbox" name="friends" value="1" defaultChecked={q.friends} />
                  People I follow
                </label>
              )}
              {p.member && p.groups.length > 0 && (
                <Select
                  name="group"
                  label="Group"
                  value={q.group}
                  options={p.groups.map((g) => [g.id, g.name])}
                />
              )}
              <button type="submit">Show</button>
            </form>
            <p className={styles.note}>
              {p.label.name}, in {p.label.unit}.
              {p.standIn
                ? ' For now the score is the game year score averaged over finished years. The Grazier Score replaces it once its weights are set.'
                : ''}
              {q.board === 'real_year' ? ' Ranked on the change over that year.' : ''}
            </p>
            <BoardTable
              rows={p.view.rows}
              mine={p.view.mine}
              unit={p.label.unit}
              links={p.member}
            />
          </div>
        </div>
      </main>
      <SiteFooter />
      {p.ticker && <Ticker />}
    </>
  );
}
