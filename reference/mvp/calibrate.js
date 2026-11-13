// Calibration runs for The Grazing Game.
// Checks the model against the benchmarks in docs/CALIBRATION.md. Run it after ANY change to
// growth, quality, intake, energy, breeding, mortality, water or stocking code, and before publishing.
//
// How to run (see docs/CALIBRATION.md for detail):
//   1. Make a scratch copy of grazing-game.html and add this line straight after `setupDialog();`:
//        window.__gg={get S(){return S},get REGS(){return REGS},get ROF(){return ROF},stepDay,newGame,diffMoney,buyCattle,ccAEfor,FARMS,REGIONS};
//      (never publish a file with the hook in it)
//   2. Open the copy in the in-app browser.
//   3. Paste this whole file into javascript_tool (or the console), then run:
//        await calibrate()          // everything, ~1-2 minutes
//        await calibrate(['steers'])  // just one suite: 'steers', 'herds', 'speed'
//   4. Compare the PASS/CHECK lines with docs/CALIBRATION.md and record the results there.
//
// Seasons are random, so each case runs several times and reports every run. A single bad run in a
// drought ('Drought' or 'Well below average') is expected; a bad run in an average season is a bug.

async function calibrate(suites = ['steers', 'herds', 'speed']) {
  const g = window.__gg;
  if (!g) return 'No window.__gg hook. Add it to a scratch copy first (see the top of tests/calibrate.js).';
  const out = [];
  const closeModals = () => { document.querySelector('#modalBox [data-close]')?.click(); const m = document.getElementById('modal'); if (m) m.hidden = true; };
  const adults = S => S.mobs.reduce((n, m) => n + m.animals.filter(a => a.kind !== 'calf').length, 0);
  const runYear = () => { for (let d = 0; d < 365; d++) { g.stepDay(); closeModals(); } };
  const range = (v, lo, hi) => (v >= lo && v <= hi ? 'PASS ' : 'CHECK') + ` (target ${lo}-${hi})`;

  // ---- 1. Steer gain per head per year, set-stocked on native pasture ----
  // [region, start month (0-based), supplement, target low, target high]
  const STEERS = [
    ['cq', 8, 'none', 20, 60],
    ['cq', 8, 'lick', 75, 130],
    ['nsw', 9, 'none', 90, 105],
    ['cw', 3, 'none', 115, 130],
    ['wv', 3, 'none', 155, 185],
    ['nt', 4, 'lick', 30, 55],
  ];
  if (suites.includes('steers')) {
    out.push('== Steer gain, kg/head/year (weaner steers at ~60% of carrying capacity on a 260 ha block with one water, scratch start) ==');
    for (const [reg, month, supp, lo, hi] of STEERS) {
      for (let rep = 0; rep < 3; rep++) {
        const ha = 260;   // small block so water distance doesn't dominate (big-farm effects are in the herds suite)
        g.newGame({ region: reg, year: 2021, month, ha, cash: 5e6, overdraft: -5e6, broke: -1e7, herd: false });
        closeModals();
        const S = g.S, s0 = `${S.rainLabel} (${S.rainF})`;
        const n = Math.max(10, Math.round(g.ccAEfor(reg, ha) * 0.6 / 0.56));
        g.buyCattle('weanerSteer', n, 'pad:' + g.ROF[S.bore]);
        for (const m of S.mobs) m.supp = supp;
        const w0 = S.mobs.reduce((t, m) => t + m.animals.reduce((s, a) => s + a.wt, 0), 0), h0 = adults(S);
        runYear();
        const w1 = S.mobs.reduce((t, m) => t + m.animals.reduce((s, a) => s + a.wt, 0), 0), h1 = adults(S);
        const gain = h1 ? (w1 / h1) - (w0 / h0) : 0, deaths = (h0 - h1) / h0 * 100;
        out.push(`${reg} ${supp.padEnd(4)} run ${rep + 1}: ${Math.round(gain)} kg/hd, deaths ${deaths.toFixed(1)}%, seasons ${s0} then ${S.rainLabel} (${S.rainF}) ${range(gain, lo, hi)}`);
      }
    }
  }

  // ---- 2. Established breeding herds: deaths, gain and conception ----
  if (suites.includes('herds')) {
    out.push('', '== Established herds, medium farm, medium difficulty, one year ==');
    for (const reg of ['cq', 'nt', 'nsw', 'cw', 'wv']) {
      for (let rep = 0; rep < 2; rep++) {
        const ha = g.FARMS[reg][1], mny = g.diffMoney(reg, ha, 'medium', true);
        g.newGame({ region: reg, year: 2024, month: rep ? 4 : 8, ha, ...mny, herd: true });
        closeModals();
        const S = g.S, h0 = adults(S), s0 = `${S.rainLabel} (${S.rainF})`;
        const t0 = performance.now(); runYear(); const ms = (performance.now() - t0) / 365;
        const y = S.years[0] || S.yr;
        const deaths = y.deaths / h0 * 100;
        const preg = S.log.filter(l => /^Preg test/.test(l.msg)).map(l => (l.msg.match(/\((\d+)%\).*expect about (\d+)%/) || []).slice(1).join('% vs exp ')).filter(Boolean);
        const [lo, hi] = reg === 'nt' ? [2, 5] : [1.5, 3.6];
        out.push(`${reg} start ${rep ? 'May' : 'Sep'}: ${h0} head, waters ${S.troughs.length}, deaths ${deaths.toFixed(1)}% ${range(deaths, lo, hi)}, gain ${Math.round(y.gain / h0)} kg/hd, seasons ${s0} then ${S.rainLabel} (${S.rainF}), ${ms.toFixed(1)} ms/day` +
          (preg.length ? `, preg tests: ${preg.slice(0, 3).join('; ')}%` : ''));
      }
    }
  }

  // ---- 3. Speed with a big herd ----
  if (suites.includes('speed')) {
    out.push('', '== Speed ==');
    const ha = g.FARMS.nt[2], mny = g.diffMoney('nt', ha, 'easy', true);
    g.newGame({ region: 'nt', year: 2024, month: 4, ha, ...mny, herd: true });
    closeModals();
    const t0 = performance.now(); for (let d = 0; d < 60; d++) { g.stepDay(); closeModals(); }
    const ms = (performance.now() - t0) / 60;
    const per1k = ms / (adults(g.S) / 1000);
    out.push(`nt large, ${adults(g.S)} head: ${ms.toFixed(2)} ms/day, ${per1k.toFixed(2)} ms per 1,000 head ${per1k < 1.25 ? 'PASS ' : 'CHECK'} (target under 5 ms/day at 4,000 head, i.e. under 1.25 per 1,000)`);
  }
  return out.join('\n');
}
