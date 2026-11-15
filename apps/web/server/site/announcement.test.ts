import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LandingPage from '@/pages/index';
import { readAnnouncement, type ReadRows } from './announcement';

const store =
  (value: unknown): ReadRows =>
  async () => [{ value }];

describe("the home page's announcement bar", () => {
  it('reads the admin setting, and shows nothing with no database or no text', async () => {
    expect(await readAnnouncement(null)).toBeNull();
    expect(await readAnnouncement(store({ text: null, link: null }))).toBeNull();
    expect(
      await readAnnouncement(store({ text: 'Spring challenge starts 1 Dec', link: null })),
    ).toEqual({
      text: 'Spring challenge starts 1 Dec',
      link: null,
    });
  });

  it('refuses a stored value the admin form would refuse, and a database fault gives no bar', async () => {
    expect(await readAnnouncement(store({ text: 'Hi', link: 'javascript:alert(1)' }))).toBeNull();
    expect(await readAnnouncement(store({ text: 'x'.repeat(141), link: null }))).toBeNull();
    const broken: ReadRows = async () => {
      throw new Error('down');
    };
    expect(await readAnnouncement(broken)).toBeNull();
  });

  it('is drawn as the bar at the top of the page, with its link', () => {
    const h = renderToStaticMarkup(
      LandingPage({
        announcement: { text: 'Spring challenge starts 1 Dec', link: '/leaderboards' },
      }),
    );
    expect(h).toContain('aria-label="Announcement"');
    expect(h).toContain('href="/leaderboards"');
    expect(h.indexOf('Announcement')).toBeLessThan(h.indexOf('<header'));
  });
});
