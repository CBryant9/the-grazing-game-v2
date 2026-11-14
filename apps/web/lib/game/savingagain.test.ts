import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  SAVE_FAILED,
  api,
  notSavedMessage,
  onSavingAgain,
  setSaveRetryDelays,
} from './api';

/*
 * A save that the server could not store is asked again, the screen says "Saving again", and a
 * job is never shown as done before the server says it is stored. If it never goes through, the
 * player is told what was not saved.
 */

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const saveFailed = (): Response =>
  reply(503, { error: 'That was not saved, so nothing on your farm has changed.', code: SAVE_FAILED });

let calls: { url: string; body: unknown }[];
let script: (() => Response | Promise<Response>)[];

beforeEach(() => {
  calls = [];
  script = [];
  setSaveRetryDelays([0, 0, 0]);
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    const next = script.shift();
    if (!next) throw new Error('no reply scripted');
    return next();
  });
});
afterEach(() => {
  onSavingAgain(null);
  setSaveRetryDelays([1500, 4000, 9000]);
  vi.unstubAllGlobals();
});

const ACT = { action: { type: 'markCalves', mob: 1 }, version: 'abc', requestId: 'req-12345678' } as never;

describe('saving again', () => {
  it('asks again with the very same one-use id, says "Saving again" meanwhile, and then shows the result', async () => {
    const states: boolean[] = [];
    onSavingAgain((a) => states.push(a));
    script = [saveFailed, saveFailed, () => reply(200, { ok: true, message: 'Done.' })];
    const r = await api.act(ACT);
    expect(r).toMatchObject({ ok: true });
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => JSON.stringify(c.body))).size).toBe(1);
    expect(states[0]).toBe(true);
    expect(states[states.length - 1]).toBe(false);
  });

  it('never reports done before the server says stored: while it fails there is no result', async () => {
    let settled = false;
    script = [saveFailed, () => new Promise((res) => setTimeout(() => res(reply(200, { ok: true })), 20))];
    const p = api.act(ACT).then((v) => {
      settled = true;
      return v;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(settled).toBe(false);
    await p;
    expect(settled).toBe(true);
  });

  it('tells the player what was not saved when it never goes through, and stops asking', async () => {
    const states: boolean[] = [];
    onSavingAgain((a) => states.push(a));
    script = [saveFailed, saveFailed, saveFailed, saveFailed, saveFailed];
    const err = await api.act(ACT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(notSavedMessage('act'));
    expect((err as ApiError).message).toMatch(/That job was not saved/);
    expect((err as ApiError).message).toMatch(/Nothing on your farm has changed/);
    expect(calls).toHaveLength(4); // the first try and three more
    expect(states[states.length - 1]).toBe(false);
  });

  it('words each kind of save', () => {
    expect(notSavedMessage('day')).toMatch(/^Next day was not saved/);
    expect(notSavedMessage('skip')).toMatch(/^That skip was not saved/);
    expect(notSavedMessage('farm')).toMatch(/^Your new farm was not saved/);
  });

  it('does not ask again for any other failure, and clears the saving line', async () => {
    const states: boolean[] = [];
    onSavingAgain((a) => states.push(a));
    script = [saveFailed, () => reply(409, { error: 'The farm changed.' })];
    const err = await api.day('abc').catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect(calls).toHaveLength(2);
    expect(states[states.length - 1]).toBe(false);
  });

  it('never asks again for a read', async () => {
    script = [saveFailed];
    await expect(api.farm()).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });
});
