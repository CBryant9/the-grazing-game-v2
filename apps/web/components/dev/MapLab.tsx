'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PADDOCK_LABELS, type FarmView, type FarmViewPaddock } from '@gg/shared';
// Types only: these lines load nothing. The renderer itself (and PixiJS with
// it) is loaded below, when the page is on screen.
import type {
  BenchResult,
  FarmMap,
  MapLayerId,
  MapLayers,
  MapPointerEvent,
  MapStats,
  MapTheme,
  MapWeatherKind,
} from '@gg/render';
import type { MapFixtureInfo } from '@/lib/devPages';
import styles from './MapLab.module.css';

type Render = typeof import('@gg/render');

export interface MapLabStart {
  fixture?: string;
  theme?: MapTheme;
  /** Screen pixels per square to start at. */
  zoom?: number;
  /** The square to start centred on. */
  at?: number;
  /** A fixed size for the map, in CSS pixels, to try a phone or tablet screen. */
  size?: { w: number; h: number };
  /** False hides the controls so the map fills the screen. */
  controls?: boolean;
  /** Runs the bench as soon as the first farm is drawn: following the screen, or back to back. */
  bench?: 'paced' | 'unpaced' | 'processor';
  /** True draws every beast, for the speed test. */
  everyBeast?: boolean;
  weather?: MapWeatherKind;
  /** Minutes after midnight. */
  time?: number;
  layers?: MapLayerId[];
}

const LAYERS: { id: MapLayerId; name: string }[] = [
  { id: 'labels', name: 'Labels' },
  { id: 'waterReach', name: 'Water reach' },
  { id: 'quality', name: 'Pasture quality' },
  { id: 'grazed', name: 'Recently grazed' },
  { id: 'arable', name: 'Arable land' },
  { id: 'pipe', name: 'Pipe' },
];

/** Screen sizes to try the map at, in CSS pixels. */
const SCREENS = [
  { value: 'fill', name: 'Fill the page' },
  { value: '375x667', name: 'Phone, upright (375 by 667)' },
  { value: '667x375', name: 'Phone, on its side (667 by 375)' },
  { value: '812x375', name: 'Long phone, on its side (812 by 375)' },
  { value: '1024x768', name: 'Tablet (1024 by 768)' },
];

const clock = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * The map's test page: pick a farm, switch layers, theme, time of day and
 * weather, and read the frame times. It reads fixture files (farm views,
 * numbers only). It never loads the engine.
 */
export function MapLab({
  fixtures,
  start = {},
}: {
  fixtures: MapFixtureInfo[];
  start?: MapLabStart;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<FarmMap | null>(null);
  const benchWanted = useRef(start.bench);

  const [render, setRender] = useState<Render | null>(null);
  const ready = render !== null;
  const [error, setError] = useState<string | null>(null);
  const [fixture, setFixture] = useState(
    start.fixture && fixtures.some((f) => f.name === start.fixture)
      ? start.fixture
      : (fixtures[0]?.name ?? ''),
  );
  const [view, setView] = useState<FarmView | null>(null);
  const [theme, setTheme] = useState<MapTheme>(start.theme ?? 'dark');
  const [layers, setLayers] = useState<Partial<MapLayers>>(() => {
    const on: Partial<MapLayers> = { labels: true };
    for (const id of start.layers ?? []) on[id] = true;
    return on;
  });
  const [daylight, setDaylight] = useState(start.time === undefined);
  const [minutes, setMinutes] = useState(start.time ?? 720);
  const [weather, setWeather] = useState<MapWeatherKind>(start.weather ?? 'clear');
  const [ambient, setAmbient] = useState(false);
  const [still, setStill] = useState(false);
  const [everyBeast, setEveryBeast] = useState(start.everyBeast === true);
  const [size, setSize] = useState(start.size ? `${start.size.w}x${start.size.h}` : 'fill');
  const [hover, setHover] = useState<MapPointerEvent | null>(null);
  const [tapped, setTapped] = useState<MapPointerEvent | null>(null);
  const [stats, setStats] = useState<MapStats | null>(null);
  const [bench, setBench] = useState<BenchResult | null>(null);
  const [benching, setBenching] = useState(false);

  const runBench = useCallback(async (unpaced = false, processorOnly = false) => {
    const map = mapRef.current;
    if (!map) return;
    setBenching(true);
    setBench(null);
    const result = await map.bench({ seconds: 6, unpaced, processorOnly });
    setBench(result);
    setBenching(false);
    setStats(map.stats());
  }, []);

  // Load the renderer and build the map, once. PixiJS arrives here and nowhere else.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let dead = false;
    let map: FarmMap | null = null;
    (async () => {
      try {
        const loaded = await import('@gg/render');
        if (dead) return;
        const made = await loaded.createFarmMap(host, {
          theme: start.theme ?? 'dark',
          everyBeast: start.everyBeast === true,
          fontFamily: getComputedStyle(document.body).fontFamily,
          label: 'Map of the test farm',
        });
        if (dead) {
          made.destroy();
          return;
        }
        map = made;
        mapRef.current = made;
        made.on('tap', (e) => {
          setTapped(e);
          made.setHighlight(e.paddock);
        });
        made.on('hover', (e) => setHover(e));
        made.on('camera', () => setStats(made.stats()));
        setRender(() => loaded);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      dead = true;
      map?.destroy();
      mapRef.current = null;
    };
    // The map is built once. Its starting theme is read only then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch the chosen fixture and hand it to the map.
  useEffect(() => {
    if (!ready || !fixture) return;
    let dead = false;
    fetch(`/dev/map/fixtures/${fixture}`)
      .then((r) => {
        if (!r.ok) throw new Error(`The fixture "${fixture}" could not be loaded (${r.status}).`);
        return r.json() as Promise<FarmView>;
      })
      .then((v) => {
        const map = mapRef.current;
        if (dead || !map) return;
        map.setView(v);
        map.setHighlight(null);
        map.fitFarm();
        if (start.zoom) map.zoomTo(start.zoom, start.at);
        else if (start.at !== undefined) map.centreOn(start.at);
        setView(v);
        setTapped(null);
        setStats(map.stats());
        // The standing grass is built over the next few frames. Read the figures again once it is in.
        setTimeout(() => {
          if (!dead && mapRef.current === map) setStats(map.stats());
        }, 800);
        setError(null);
        const wanted = benchWanted.current;
        if (wanted) {
          benchWanted.current = undefined;
          setTimeout(() => void runBench(wanted !== 'paced', wanted === 'processor'), 600);
        }
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => {
      dead = true;
    };
  }, [ready, fixture, start.zoom, start.at, runBench]);

  useEffect(() => {
    if (ready) mapRef.current?.setTheme(theme);
    // The page follows the map's theme, so both can be looked at together.
    document.documentElement.setAttribute('data-theme', theme);
  }, [ready, theme]);
  useEffect(() => {
    if (ready) mapRef.current?.setLayers(layers);
  }, [ready, layers]);
  useEffect(() => {
    if (ready) mapRef.current?.setTimeOfDay(daylight ? null : minutes);
  }, [ready, daylight, minutes]);
  useEffect(() => {
    if (ready) mapRef.current?.setWeather({ kind: weather });
  }, [ready, weather]);
  useEffect(() => {
    if (ready) mapRef.current?.setAmbient(ambient);
  }, [ready, ambient]);
  useEffect(() => {
    if (ready) mapRef.current?.setReduceMotion(still);
  }, [ready, still]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setEveryBeast(everyBeast);
    setStats(map.stats());
  }, [ready, everyBeast]);

  const info = fixtures.find((f) => f.name === fixture);
  const paddock = tapped && view ? view.paddocks.find((p) => p.id === tapped.paddock) : undefined;
  const first = view?.light.first ?? 360;
  const last = view?.light.last ?? 1080;
  const controls = start.controls !== false;
  const [bw, bh] = size.split('x').map(Number);
  const box = bw && bh ? { w: bw, h: bh } : null;

  return (
    <div className={controls ? styles.page : styles.bare}>
      <div
        className={box ? `${styles.stage} ${styles.boxed}` : styles.stage}
        style={box ? { width: box.w, height: box.h } : undefined}
      >
        <div ref={hostRef} className={styles.map} data-testid="map-host" />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {!fixtures.length && (
          <p className={styles.error} role="alert">
            No fixtures yet. Run <code>pnpm dev:map-fixtures</code> and reload.
          </p>
        )}
        {(bench || benching) && (
          <p className={styles.benchline} data-testid="bench-line">
            {benching || !bench
              ? 'Measuring…'
              : `${bench.paced ? `paced: frame mean ${bench.frame.meanMs} p95 ${bench.frame.p95Ms} p99 ${bench.frame.p99Ms} max ${bench.frame.maxMs} ms, ${bench.frame.fps} fps | ` : 'unpaced | '}draw mean ${bench.draw.meanMs} p50 ${bench.draw.p50Ms} p95 ${bench.draw.p95Ms} p99 ${bench.draw.p99Ms} max ${bench.draw.maxMs} ms over ${bench.draw.frames} frames | out ${bench.parts.zoomedOut.p50Ms}/${bench.parts.zoomedOut.p95Ms} in ${bench.parts.zoomedIn.p50Ms}/${bench.parts.zoomedIn.p95Ms} zooming ${bench.parts.zooming.p50Ms}/${bench.parts.zooming.p95Ms} (p50/p95) | ${bench.cattleDrawn} of ${bench.head} head drawn | ${bench.tuftPieces} grass pieces | ${bench.width}x${bench.height} at ${bench.pixelRatio}x`}
          </p>
        )}
      </div>

      {controls && (
        <aside className={styles.panel} aria-label="Map controls">
          <h1 className={`px ${styles.h1}`}>Map test page</h1>
          <p className="muted">
            For builders. Not part of the live site. The farms below are fixture files: farm views
            only, the same numbers the server will send.
          </p>

          <label className={styles.field}>
            <span>Farm</span>
            <select value={fixture} onChange={(e) => setFixture(e.target.value)}>
              {fixtures.map((f) => (
                <option key={f.name} value={f.name}>
                  {f.title}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.field}>
            <span>Screen</span>
            <select value={size} onChange={(e) => setSize(e.target.value)}>
              {SCREENS.some((sc) => sc.value === size) ? null : (
                <option value={size}>{size}</option>
              )}
              {SCREENS.map((sc) => (
                <option key={sc.value} value={sc.value}>
                  {sc.name}
                </option>
              ))}
            </select>
          </label>
          {info && (
            <p className="muted">
              {info.note} {info.farmHa.toLocaleString('en-AU')} ha,{' '}
              {info.head.toLocaleString('en-AU')} head, {info.paddocks} paddocks. View size{' '}
              {(info.bytes / 1024).toFixed(1)} KB.
              {view &&
                ` ${view.date.date} ${MONTHS[view.date.month]} ${view.date.year}, first light ${clock(first)}, last light ${clock(last)}.`}
            </p>
          )}

          <div className={styles.row}>
            <button
              type="button"
              className="btn"
              onClick={() => mapRef.current?.fitFarm('contain')}
            >
              Whole farm
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => mapRef.current?.zoomTo((mapRef.current?.getCamera().zoom ?? 20) * 1.5)}
            >
              Zoom in
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => mapRef.current?.zoomTo((mapRef.current?.getCamera().zoom ?? 20) / 1.5)}
            >
              Zoom out
            </button>
          </div>

          <fieldset className={styles.group}>
            <legend>Theme</legend>
            {(['dark', 'light'] as const).map((t) => (
              <label key={t} className={styles.check}>
                <input
                  type="radio"
                  name="theme"
                  checked={theme === t}
                  onChange={() => setTheme(t)}
                />
                {t === 'dark' ? 'Dark' : 'Light'}
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Layers</legend>
            {LAYERS.map((l) => (
              <label key={l.id} className={styles.check}>
                <input
                  type="checkbox"
                  checked={layers[l.id] === true}
                  onChange={(e) => setLayers((was) => ({ ...was, [l.id]: e.target.checked }))}
                />
                {l.name}
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Time of day</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={daylight}
                onChange={(e) => setDaylight(e.target.checked)}
              />
              Plain daylight
            </label>
            <label className={styles.field}>
              <span>
                {clock(minutes)} (first light {clock(first)}, last light {clock(last)})
              </span>
              <input
                type="range"
                min={first - 90}
                max={last + 90}
                step={5}
                value={minutes}
                disabled={daylight}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Weather</legend>
            {(['clear', 'overcast', 'rain'] as const).map((w) => (
              <label key={w} className={styles.check}>
                <input
                  type="radio"
                  name="weather"
                  checked={weather === w}
                  onChange={() => setWeather(w)}
                />
                {w === 'clear' ? 'Clear' : w === 'overcast' ? 'Overcast' : 'Rain'}
              </label>
            ))}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Motion</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={ambient}
                onChange={(e) => setAmbient(e.target.checked)}
              />
              Turn the windmill
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={still} onChange={(e) => setStill(e.target.checked)} />
              Reduce motion
            </label>
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Speed</legend>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={everyBeast}
                onChange={(e) => setEveryBeast(e.target.checked)}
              />
              Draw every beast (the map samples big mobs otherwise)
            </label>
            <button
              type="button"
              className="btn lime"
              onClick={() => void runBench()}
              disabled={benching}
            >
              {benching ? 'Measuring…' : 'Run the bench (6 s)'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => void runBench(true)}
              disabled={benching}
            >
              Measure drawing only
            </button>
            <p className="muted">
              The bench follows the screen, so run it with this tab in front. The second button
              draws frames back to back and waits for the graphics card each time, so it also works
              in a background tab.
            </p>
            {stats && (
              <p className="muted" data-testid="stats-line">
                {stats.cattleDrawn.toLocaleString('en-AU')} of {stats.head.toLocaleString('en-AU')}{' '}
                head drawn, {stats.tuftPieces.toLocaleString('en-AU')} grass pieces. {stats.zoom} px
                a square ({stats.lod === 'far' ? 'zoomed out' : 'zoomed in'}), drawn at{' '}
                {stats.pixelRatio}x. Last view took {stats.lastViewMs} ms (
                {Object.entries(stats.lastViewParts)
                  .map(([k, v]) => `${k} ${v}`)
                  .join(', ')}
                ). {stats.framesDrawn} frames drawn so far.
              </p>
            )}
            {bench && (
              <table className={styles.table}>
                <caption>Frame times over {bench.seconds} seconds, in milliseconds</caption>
                <thead>
                  <tr>
                    <th scope="col"></th>
                    <th scope="col">Mean</th>
                    <th scope="col">Middle</th>
                    <th scope="col">95%</th>
                    <th scope="col">99%</th>
                    <th scope="col">Worst</th>
                  </tr>
                </thead>
                <tbody>
                  <tr hidden={!bench.paced}>
                    <th scope="row">Frame to frame</th>
                    <td>{bench.frame.meanMs}</td>
                    <td>{bench.frame.p50Ms}</td>
                    <td>{bench.frame.p95Ms}</td>
                    <td>{bench.frame.p99Ms}</td>
                    <td>{bench.frame.maxMs}</td>
                  </tr>
                  <tr>
                    <th scope="row">Drawing</th>
                    <td>{bench.draw.meanMs}</td>
                    <td>{bench.draw.p50Ms}</td>
                    <td>{bench.draw.p95Ms}</td>
                    <td>{bench.draw.p99Ms}</td>
                    <td>{bench.draw.maxMs}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {bench && bench.paced && (
              <p className="muted">
                {bench.frame.fps} frames a second. {Math.round(bench.frame.slowShare * 100)}% of
                frames slower than 60 a second allows, {bench.frame.over50} over 50 ms.
              </p>
            )}
          </fieldset>

          <fieldset className={styles.group}>
            <legend>Under the pointer</legend>
            <p className="muted" data-testid="hover-line">
              {hover
                ? `${hover.paddockName}, square ${hover.col}, ${hover.row}`
                : 'Move the mouse over the farm, or tap it.'}
            </p>
            {paddock && view && render && (
              <PaddockCard paddock={paddock} view={view} render={render} />
            )}
          </fieldset>
        </aside>
      )}
    </div>
  );
}

/** What a tap opens: the paddock, with its side-view picture. Never a cow. */
function PaddockCard({
  paddock,
  view,
  render,
}: {
  paddock: FarmViewPaddock;
  view: FarmView;
  render: Render;
}) {
  const parts = render.swardParts(paddock, view.plantings);
  const label = PADDOCK_LABELS[paddock.label];
  return (
    <div className={styles.card} data-testid="paddock-card">
      <p>
        <strong>{paddock.name}</strong>{' '}
        <span className="chip" style={{ background: label.colour }}>
          {label.name}
        </span>{' '}
        {paddock.ha.toLocaleString('en-AU')} ha.{' '}
        {paddock.water === 'own'
          ? 'Has water.'
          : paddock.water === 'gate'
            ? 'Water via a gate.'
            : 'No water.'}
      </p>
      <div className={styles.pics}>
        {parts.map((part) => (
          <figure key={part.title} className={styles.pic}>
            <canvas
              ref={(el) => {
                if (el) {
                  render.drawSward(el, part.sward, {
                    width: parts.length > 1 ? 150 : 300,
                    height: 110,
                    pixelRatio: window.devicePixelRatio,
                    seed: paddock.id + part.title.length,
                    fontFamily: getComputedStyle(document.body).fontFamily,
                  });
                }
              }}
            />
            <figcaption className="muted">
              {parts.length > 1 ? `${part.title}, ${part.ha.toLocaleString('en-AU')} ha. ` : ''}
              {render.swardCaption(part.sward)}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
