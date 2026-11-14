import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  COMMUNITY_SWITCHES,
  EVERYONE,
  ID,
  ME,
  as,
  freshDb,
  passed,
  switchesSql,
  type Who,
} from './harness';
import { MATRIX, type Op, type SqlFor } from './matrix';

// Every table, every kind of caller, select, insert, update and delete.
// Each cell must get through or be refused exactly as MATRIX says.

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await db.exec(switchesSql(COMMUNITY_SWITCHES, true));
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const text = (s: SqlFor | undefined, me: string, who: Who): string | undefined =>
  s === undefined ? undefined : typeof s === 'string' ? s : s(me, who);

async function outcome(op: Op, who: Who) {
  const me = op.me?.[who] ?? ME[who];
  return as(db, who, text(op.sql, me, who)!, text(op.prep, me, who));
}

const OPS = ['select', 'insert', 'update', 'delete'] as const;

for (const [table, spec] of Object.entries(MATRIX)) {
  describe(table, () => {
    for (const opName of OPS) {
      const op = spec[opName];
      it(`${opName}: only ${op.pass.join(', ') || 'no one'}`, async () => {
        const got: Record<string, boolean> = {};
        const want: Record<string, boolean> = {};
        const why: Record<string, string> = {};
        for (const who of EVERYONE) {
          const o = await outcome(op, who);
          got[who] = passed(o);
          want[who] = op.pass.includes(who);
          if (got[who] !== want[who]) why[who] = o.ok ? `${o.affected} rows` : o.error;
        }
        expect({ got, why }).toEqual({ got: want, why: {} });
      });
    }

    // Writing a row as someone else: B tries to insert the same row for A.
    it('insert: B can not write a row for A', async () => {
      const op = spec.insert;
      const sql = text(op.sql, ID.a, 'b')!;
      const o = await as(db, 'b', sql, text(op.prep, ID.a, 'b'));
      expect(passed(o)).toBe(false);
    });
  });
}
