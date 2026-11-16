import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { latestOnly } from './latest';

/** A call the test settles by hand. */
function make() {
  const calls: { arg: string; resolve: (v: string) => void; reject: (e: unknown) => void }[] = [];
  const done: string[] = [];
  const failed: string[] = [];
  const l = latestOnly<string, string>({
    everyMs: 300,
    call: (arg) =>
      new Promise((resolve, reject) => {
        calls.push({ arg, resolve, reject });
      }),
    done: (r) => done.push(r),
    fail: (_e, arg) => failed.push(arg),
  });
  return { l, calls, done, failed };
}

const settle = () => vi.advanceTimersByTimeAsync(0);

describe('asking about a line while it is drawn', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => vi.useRealTimers());

  it('the first ask goes at once', () => {
    const { l, calls } = make();
    l.schedule('a');
    expect(calls.map((c) => c.arg)).toEqual(['a']);
  });

  it('a stream of pointer moves is a few asks a second at most', async () => {
    const { l, calls } = make();
    // A pointer move every 16 ms for two seconds.
    for (let t = 0; t < 2000; t += 16) {
      l.schedule(`m${t}`);
      await vi.advanceTimersByTimeAsync(16);
    }
    expect(calls.length).toBeLessThanOrEqual(8);
    expect(calls.length).toBeGreaterThanOrEqual(5);
  });

  it('what is sent after a wait is the newest, not the first', async () => {
    const { l, calls } = make();
    l.schedule('a');
    l.schedule('b');
    l.schedule('c');
    expect(calls.map((c) => c.arg)).toEqual(['a']);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls.map((c) => c.arg)).toEqual(['a', 'c']);
  });

  it('only the newest answer is used: an older one that arrives late is dropped', async () => {
    const { l, calls, done } = make();
    l.schedule('a');
    await vi.advanceTimersByTimeAsync(400);
    l.schedule('b');
    expect(calls).toHaveLength(2);
    // The answer to b comes first, then a's, late.
    calls[1]!.resolve('answer b');
    calls[0]!.resolve('answer a');
    await settle();
    expect(done).toEqual(['answer b']);
  });

  it('an answer to an ask that has been replaced is not used', async () => {
    const { l, calls, done } = make();
    l.schedule('a');
    calls[0]!.resolve('answer a');
    await settle();
    expect(done).toEqual(['answer a']);
    l.schedule('b');
    l.schedule('c');
    await vi.advanceTimersByTimeAsync(300);
    calls[1]!.resolve('answer c');
    await settle();
    expect(done).toEqual(['answer a', 'answer c']);
  });

  it('a flush asks at once, and drops what was waiting', async () => {
    const { l, calls } = make();
    l.schedule('a');
    l.schedule('b');
    l.flush('final');
    expect(calls.map((c) => c.arg)).toEqual(['a', 'final']);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
  });

  it('cancel drops what is waiting and ignores an answer still on its way', async () => {
    const { l, calls, done } = make();
    l.schedule('a');
    l.schedule('b');
    l.cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve('late');
    await settle();
    expect(done).toEqual([]);
  });

  it('reports a failure of the newest ask only', async () => {
    const { l, calls, failed } = make();
    l.schedule('a');
    await vi.advanceTimersByTimeAsync(400);
    l.schedule('b');
    calls[0]!.reject(new Error('old'));
    calls[1]!.reject(new Error('new'));
    await settle();
    expect(failed).toEqual(['b']);
  });
});
