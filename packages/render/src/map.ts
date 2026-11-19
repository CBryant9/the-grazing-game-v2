/**
 * The farm map (PixiJS v8).
 *
 * It draws a farm from a farm view: plain numbers sent by the server. It
 * holds no game rules. The picture must match the model (docs/VISUALS.md).
 *
 * Style: a clear map zoomed out, detail zoomed in (PRD 7, S3 + S5).
 * - Zoomed out: each square a clean field of colour, raised a little by its
 *   grass height, and one marker for each mob with its head count.
 * - Zoomed in: grass tufts built from the model's figures for each square,
 *   and individual cattle with an outline and a shadow.
 *
 * Speed (PRD 14.10):
 * - Nothing is drawn unless something changed: there is no idle redraw loop.
 * - Grass is a static batch. Moving the camera only moves the container it
 *   sits in. Cattle walk and graze (herd.ts): only their positions and sizes
 *   go up to the graphics card each frame, and only while something moves.
 * - A new view redraws only the rows of grass whose squares changed, and
 *   moves cattle only if something about them or their fences changed.
 * - Light and weather are a tint, not a full-screen filter.
 * - The screen's pixel ratio is capped (2 by default) and can step down.
 */

// The site's Content-Security-Policy allows no eval (apps/web/lib/csp.ts). This swaps PixiJS's
// generated shader and uniform code for its plain versions, so the map never calls `new Function`.
import 'pixi.js/unsafe-eval';
import {
  Application,
  CanvasSource,
  Container,
  Graphics,
  Particle,
  ParticleContainer,
  Rectangle,
  Sprite,
  Text,
  Texture,
  TilingSprite,
} from 'pixi.js';
import {
  FARM_VIEW_VERSION,
  PADDOCK_LABELS,
  VIEW_FENCE,
  type FarmView,
  type ViewEdge,
} from '@gg/shared';
import { STRUGGLE, frameStats, struggling, type BenchResult } from './bench';
import {
  MAX_ZOOM,
  clampCamera,
  containZoom,
  fitFarm as fitCamera,
  lookAt,
  minZoom,
  panBy as panCamera,
  visibleWorld,
  worldToScreen,
  zoomAt,
  type Camera,
  type FitMode,
  type Point,
  type ScreenInset,
  type Viewport,
} from './camera';
import {
  ANIMAL_MIN_PX,
  CATTLE_LENGTH_M,
  cowPx,
  placeCattle,
  placementKey,
  type MobPlacement,
} from './cattle';
import { Herd, WALK_LENGTHS_PER_S } from './herd';
import { SHEEP_LENGTH_M, placeSheep, sheepPlacementKey, type FlockPlacement } from './sheep';
import { shade } from './colour';
import { columnsSpanned, fenceRuns, outlineOf, type FenceRun } from './fences';
import {
  allLooks,
  farFrontBands,
  farSeedFlecks,
  sameLook,
  squareTufts,
  type SquareLook,
  type Tuft,
} from './grass';
import {
  GRID_H,
  GRID_N,
  GRID_W,
  GROUND_SQUASH as K,
  WORLD_H,
  WORLD_W,
  colOf,
  cornerXY,
  edgeEnds,
  rowOf,
} from './grid';
import { GROUND_H, GROUND_W, paintGround } from './ground';
import { hitTest, squareAtScreen, type MapHit } from './hit';
import { attachInput, type DragPhase, type InputHandle, type InputMode } from './input';
import {
  TOUCH_PX,
  cornerJoinsFence,
  cornerVertex,
  fenceCodeAt,
  isDownCode,
  nearestCorner,
  nearestEdge,
  sameCorner,
  type Corner,
} from './lines';
import type { DraftDot, DraftKind, MapDraft } from './draft';
import {
  BUILD_GRID,
  bucketZoom,
  edgeCorner,
  gridBucket,
  fencedCorners,
  fencedEdges,
  gridKindFor,
  gridLines,
  gridStep,
  lengthWords,
  nearCorners,
  nearLines,
  showCornerDots,
  targetCentre,
} from './buildgrid';
import { DEFAULT_LAYERS, withLayers, type MapLayers } from './layers';
import { mapTint, type MapWeather } from './light';
import { DOT_PX, easeFade, fadeStep, herdAsDots, lodMode, type LodMode } from './lod';
import { CONTRACT_TAG, CONTRACT_TAG_MIN_PX, MESH, TICK, tickOffsets } from './linestyle';
import { paintWash, type WashLayer } from './overlays';
import { pickableDraws, type PickablePaddock } from './pickable';
import { NATURAL, breedFor, paletteFor, type MapPalette, type MapTheme } from './palette';
import { scatter } from './random';
import { SURROUND_TILE, paintSurround, surroundScale } from './surround';
import {
  CATTLE_W_PER_BODY,
  DOT_SPRITE,
  SHEEP_W_PER_BODY,
  cattleSprite,
  defaultSprites,
  sheepSprite,
} from './sprites/painters';
import { packAtlas, type SpriteDef, type SpriteRegistry } from './sprites/registry';

export interface FarmMapOptions {
  /** The farm to show first. */
  view?: FarmView;
  theme?: MapTheme;
  layers?: Partial<MapLayers>;
  /** Sprites to use in place of the ones drawn in code. */
  sprites?: SpriteRegistry;
  /** The most screen pixels drawn for each CSS pixel. 2 unless set. */
  maxPixelRatio?: number;
  /** True to hold everything still. Follows the device's "reduce motion" setting unless set. */
  reduceMotion?: boolean;
  /** Turn the windmill and pulse the bore's ring. Off unless set, so a still map costs nothing. */
  ambient?: boolean;
  /** The font for labels and markers. */
  fontFamily?: string;
  /** How the farm is first fitted to the screen. */
  fit?: FitMode;
  /** Follow the size of the host element. On unless set to false. */
  autoResize?: boolean;
  /** What a screen reader calls the map. */
  label?: string;
  /**
   * Draw every beast, up to six to a square. For the speed test only: big
   * mobs then hide the pasture, which the map otherwise never lets them do.
   */
  everyBeast?: boolean;
}

/** A tap, a click, or the mouse over the map: the square and paddock, and where on the map. */
export interface MapPointerEvent extends MapHit {
  /** Where on the map, in CSS pixels from its top left. */
  x: number;
  y: number;
}

/**
 * What a drawing tool does with the pointer.
 * - `corners`: a drag draws a fence along the grid, corner to corner.
 * - `squares`: a drag lays pipe across squares.
 * - `edge`: a tap picks a fence segment or gate.
 * - `square`: a tap picks a square.
 * - `corner`: a tap picks a grid corner.
 * - `look`: no tool. One finger pans and a tap opens a paddock.
 */
export type MapTool = 'look' | 'corners' | 'squares' | 'edge' | 'square' | 'corner';

/** A drag in a drawing tool. `corner` is set for `corners`, `square` for `squares` (-1 off the farm). */
export interface MapDragEvent {
  phase: DragPhase;
  corner: Corner | null;
  square: number;
  x: number;
  y: number;
}

/** A tap in a tool: everything near it, and the tool decides which counts. */
export interface MapToolTapEvent extends MapPointerEvent {
  /** The nearest segment that holds a fence or gate within a touch, or null. */
  edge: ViewEdge | null;
  /** The VIEW_FENCE code on that segment. */
  edgeCode: number;
  /** How far that segment is from the tap, in screen pixels. Infinity with none. */
  edgeDistPx: number;
  /** The nearest grid corner within a touch, or null. */
  corner: Corner | null;
  /** True when a water hub stands on that corner. */
  hub: boolean;
  /** True when the tapped square holds a water hub (a trough with a gate on every side). */
  squareHub: boolean;
}

/** A tap on a fence that is down, in Look: it offers to put it back up. */
export interface MapFenceTapEvent {
  edge: ViewEdge;
  edgeCode: number;
  x: number;
  y: number;
}

export interface MapEvents {
  /** A tap or click on the farm. It reports the square and paddock, never a cow. */
  tap: MapPointerEvent;
  /** The mouse moved onto a new square, or off the farm (null). */
  hover: MapPointerEvent | null;
  /** The camera moved. */
  camera: Camera;
  /** A drawing drag, in a `corners` or `squares` tool. */
  drag: MapDragEvent;
  /** A tap in a picking tool (`edge`, `square` or `corner`). */
  toolTap: MapToolTapEvent;
  /** A tap on a fence that is down, in Look. */
  fenceTap: MapFenceTapEvent;
}

export interface MapStats {
  /** Head on the farm (calves included) and how many of them are drawn. */
  head: number;
  cattleDrawn: number;
  /** Sheep on the farm (lambs at foot included) and how many of them are drawn. */
  sheep: number;
  sheepDrawn: number;
  /** Grass pieces drawn zoomed in. */
  tuftPieces: number;
  /** Milliseconds the last view took to apply, and where the time went. */
  lastViewMs: number;
  lastViewParts: Record<string, number>;
  pixelRatio: number;
  zoom: number;
  lod: 'far' | 'near';
  /** Frames drawn since the map started. Stays put while nothing changes. */
  framesDrawn: number;
}

export interface BenchOptions {
  /** How long to run. 6 seconds unless set. */
  seconds?: number;
  /**
   * Draw frames back to back and wait for the graphics card after each one.
   * Use this in a background tab, where the browser holds paced frames back.
   */
  unpaced?: boolean;
  /**
   * On an unpaced run, do not wait for the graphics card. The figure is then
   * the time on the processor alone: the part that can block the page.
   */
  processorOnly?: boolean;
}

export interface FarmMap {
  readonly canvas: HTMLCanvasElement;
  setView(view: FarmView): void;
  setLayers(change: Partial<MapLayers>): void;
  getLayers(): MapLayers;
  setTheme(theme: MapTheme): void;
  /** Minutes after midnight on the farm's clock, or null for plain daylight. */
  setTimeOfDay(minutes: number | null): void;
  setWeather(weather: MapWeather): void;
  /** Outline a paddock, or null to clear it. */
  setHighlight(paddock: number | null): void;
  /** Outline the paddocks a tool can pick (light), and mark those with no water (purple, as the water layer). Null clears it. */
  setPickable(paddocks: readonly PickablePaddock[] | null): void;
  /**
   * What the pointer does: Look, or one of the build tools (see `MapTool`).
   * In a tool a drag draws (or a tap picks), the mouse shows what is under
   * it, and the map is panned with two fingers, the space bar or the middle button.
   */
  setTool(tool: MapTool): void;
  /** Draw a draft on top of the map (a line about to be built), or null to clear it. Only the overlay is redrawn. */
  setDraft(draft: MapDraft | null): void;
  /**
   * How much of the top and bottom of the map the page covers, in CSS pixels
   * (a phone's floating top bar and build tray). The map can then be dragged
   * that much further, so every part of the farm can be brought into the clear.
   */
  setInsets(top: number, bottom: number, left?: number, right?: number): void;
  /**
   * Contract fencing under way: the segments the contractor has built and
   * the ones still to build, drawn in the contractor's colour. Null clears it.
   */
  setContractor(fence: ContractorFence | null): void;
  /** Where a point on the ground is on screen, in CSS pixels. For placing a card beside a line. */
  groundToScreen(gx: number, gy: number): Point;
  setAmbient(on: boolean): void;
  setReduceMotion(on: boolean): void;
  /** Draw every beast, or go back to sampling big mobs. For the speed test. */
  setEveryBeast(on: boolean): void;
  /**
   * How fast the farm's days are running, so the cattle walk faster when
   * the days do: 1 (the default), 2, 4, or 0 for paused. Paused, they stand
   * still, though a mob that was just moved still walks to its paddock.
   */
  setCattlePace(pace: number): void;
  fitFarm(mode?: FitMode): void;
  /** Zoom to a level in screen pixels per square, on a square or on the middle of the screen. */
  zoomTo(pxPerSquare: number, square?: number): void;
  panBy(dx: number, dy: number): void;
  centreOn(square: number): void;
  getCamera(): Camera;
  /** Where the middle of a square is on screen, in CSS pixels. For pinning buttons to the map. */
  squareToScreen(square: number): Point;
  /** Fit the host element again, or take a size in CSS pixels. */
  resize(width?: number, height?: number): void;
  on<E extends keyof MapEvents>(event: E, handler: (e: MapEvents[E]) => void): () => void;
  /** Move the camera through a set path and report frame times. */
  bench(options?: BenchOptions): Promise<BenchResult>;
  stats(): MapStats;
  destroy(): void;
}

/** A contractor's fence under way, as segments. */
export interface ContractorFence {
  built: readonly ViewEdge[];
  left: readonly ViewEdge[];
}

const sameEdges = (a: readonly ViewEdge[], b: readonly ViewEdge[]): boolean =>
  a.length === b.length && a.every((e, i) => e.line === b[i]!.line && e.index === b[i]!.index);

const sameContractor = (a: ContractorFence, b: ContractorFence): boolean =>
  sameEdges(a.built, b.built) && sameEdges(a.left, b.left);

type HoverTarget =
  | { kind: 'edge'; edge: ViewEdge }
  | { kind: 'square'; square: number }
  | { kind: 'corner'; corner: Corner };

/** The line colour a draft is drawn in: the same as the fence or pipe it will become. */
const DRAFT_COLOUR: Record<DraftKind, number> = {
  permanent: NATURAL.fencePermanent,
  contract: NATURAL.fenceContract,
  electric: NATURAL.fenceElectric,
  tape: NATURAL.fenceTape,
  netting: NATURAL.fenceNetting,
  pipe: NATURAL.pipe,
  mark: 0xffffff,
};

const DEFAULT_FONT = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';

/** Line widths in screen pixels. */
const PX = {
  farCasing: 3.4,
  farWire: 1.7,
  farBoundaryCasing: 4.8,
  farBoundaryWire: 2.4,
  /** Sheep netting is a little bolder than the wires, so its mesh can show. */
  farNettingCasing: 5.2,
  farNettingWire: 3.4,
  pipe: 2.6,
  outline: 2,
  highlight: 3,
} as const;

/**
 * Zoomed in, lines are drawn as if the zoom were this step: about 27 pixels
 * a square, where the detail first shows. From there they grow with the zoom.
 */
const NEAR_LINES = Math.round(Math.log2(27) * 2);
/** A fence wire's width zoomed in, in world units: about a pixel at the switch, four at the closest zoom. */
const NEAR_WIRE = 0.042;

/** Milliseconds a frame may spend rebuilding standing grass after a new view. */
const GRASS_BUDGET_MS = 5;

/** How high the wires and posts stand, in world units. */
const WIRE_LIFT: Record<number, readonly number[]> = {
  [VIEW_FENCE.boundary]: [0.06, 0.12],
  [VIEW_FENCE.permanent]: [0.06, 0.12],
  [VIEW_FENCE.electric]: [0.07, 0.13],
  [VIEW_FENCE.tape]: [0.085],
  [VIEW_FENCE.netting]: [0.04, 0.17],
};
const POST_HEIGHT: Record<number, number> = {
  [VIEW_FENCE.boundary]: 0.16,
  [VIEW_FENCE.permanent]: 0.15,
  [VIEW_FENCE.electric]: 0.15,
  [VIEW_FENCE.tape]: 0.105,
  [VIEW_FENCE.netting]: 0.19,
};

interface Row {
  /** Gates on the line along the top of this row. */
  line: Container;
  tufts: ParticleContainer<Particle>;
  things: Container;
  cattle: ParticleContainer<Particle>;
  tuftCount: number;
}

interface Wash {
  sprite: Sprite;
  canvas: HTMLCanvasElement;
  dirty: boolean;
}

/** A paddock at least this wide on screen gets its two-line label. Narrower, its name and a dot. */
const PADDOCK_LABEL_FULL_PX = 130;
/** A paddock narrower than this on screen gets no label. Its name in full does not fit. */
const PADDOCK_LABEL_MIN_PX = 96;

/** Screen pixels a mob's zoomed-out marker sits above the top edge of its herd, so the herd shows. */
const FAR_MARKER_LIFT = 12;

interface PadLabel {
  root: Container;
  full: Container;
  small: Container;
  /** Where it hangs from: the top of the paddock above its middle square, in world units. */
  wx: number;
  wy: number;
  columns: number;
}

interface PinnedLabel {
  root: Container;
  wx: number;
  wy: number;
  /** Screen pixels to lift it above its point. */
  lift: number;
  /** Shown only at this level of detail, or always. */
  when: 'far' | 'near' | 'always';
  /** Hidden when the labels layer is off. */
  isLabel: boolean;
  /** Shown only while this many columns take up enough of the screen. 0 for always. */
  columns: number;
}

const WASH_LAYERS: readonly WashLayer[] = ['waterReach', 'quality', 'grazed', 'arable'];

/** The row of the map a ground y is in. */
const rowFor = (gy: number): number => Math.min(GRID_H - 1, Math.max(0, Math.floor(gy)));

/** The square a ground point is on. */
const cellOf = (gx: number, gy: number): number =>
  rowFor(gy) * GRID_W + Math.min(GRID_W - 1, Math.max(0, Math.floor(gx)));

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Build the map in a host element. The host should have a size; the map fills it. */
export async function createFarmMap(
  host: HTMLElement,
  options: FarmMapOptions = {},
): Promise<FarmMap> {
  const map = new PixiFarmMap(host, options);
  await map.start();
  return map;
}

class PixiFarmMap implements FarmMap {
  private readonly app = new Application();
  private readonly world = new Container();
  private readonly ui = new Container();
  private readonly rows: Row[] = [];
  private readonly washes = new Map<WashLayer, Wash>();
  private readonly handlers: { [E in keyof MapEvents]: Set<(e: MapEvents[E]) => void> } = {
    tap: new Set(),
    hover: new Set(),
    camera: new Set(),
    drag: new Set(),
    toolTap: new Set(),
    fenceTap: new Set(),
  };

  private base = new Graphics();
  /** The bush round the farm, in screen space under the world, moved with it (mockup: the bush tile). */
  private surround: TilingSprite | null = null;
  private surroundCanvas: HTMLCanvasElement | null = null;
  private far = new Graphics();
  private pipeG = new Graphics();
  private footprints = new Graphics();
  private ring = new Graphics();
  private outlines = new Graphics();
  /** The draft of a line about to be built, and what the mouse is over in a tool. Each redraws on its own. */
  private draftG = new Graphics();
  private hoverG = new Graphics();
  /** The build grid: drawn once per zoom while a tool is picked, never per frame. */
  private gridG = new Graphics();
  /** The grid near the pointer or finger, stronger. Redrawn only when the corner under it changes. */
  private gridNearG = new Graphics();
  private gridFocus: Corner | null = null;
  /** Screen covered by the page's bars (a phone's top bar and build tray): the farm may be pulled out from under them. */
  private inset: Required<ScreenInset> = { top: 0, bottom: 0, left: 0, right: 0 };
  /** The zoom step the grid was last drawn for. NaN when it is not drawn. */
  private gridBucket = NaN;
  /** The live length at the end of a line being drawn. */
  private lengthTag: Container | null = null;
  private lengthTagAt: { wx: number; wy: number } | null = null;
  private buildUi = new Container();
  /** The contractor's fence under way: built (solid) and still to build (dashed), in the contractor's own colour. */
  private contractG = new Graphics();
  private contractor: ContractorFence | null = null;
  /** The "Team fence" tag on the run, and the point on the map it sits at. */
  private contractTag: Container | null = null;
  private contractTagAt: { wx: number; wy: number } | null = null;
  private tool: MapTool = 'look';
  private draft: MapDraft | null = null;
  private hoverTool: HoverTarget | null = null;
  /** The zoom the overlay was last drawn at. Line widths follow the zoom. */
  private overlayZoom = 0;
  private dragLast = '';
  private fenceFar = new Graphics();
  private fenceNear = new Graphics();
  private labelLayer = new Container();
  private rain = new ParticleContainer<Particle>({
    dynamicProperties: { position: true, vertex: false, rotation: false, uvs: false, color: false },
  });
  private rainSpeed: number[] = [];
  private groundSprite!: Sprite;
  private groundCanvas!: HTMLCanvasElement;
  private groundPixels!: ImageData;
  private fan: Sprite | null = null;

  private textures = new Map<string, Texture>();
  private defs = new Map<string, SpriteDef>();
  private palette: MapPalette;
  private layers: MapLayers;
  private view: FarmView | null = null;
  private looks: SquareLook[] = [];
  private raise = new Float32Array(GRID_N);
  private placements: MobPlacement[] = [];
  /** The cattle on the map, walking and grazing. */
  private readonly herd = new Herd();
  /** How fast the days run: the cattle walk faster with them (0 is paused). */
  private cattlePace = 1;
  /** One sprite for each beast in the herd, in the same order. */
  private beastParts: Particle[] = [];
  /** Which row each beast's sprite is in now. */
  private beastRow = new Int16Array(0);
  /** For each sprite in the cattle rows (cattle then sheep): its length against a cow's, and its body length in texture pixels. */
  private beastLen = new Float32Array(0);
  private beastTex = new Float32Array(0);
  private sheepParts: Particle[] = [];
  private sheepLen = new Float32Array(0);
  private sheepTex = new Float32Array(0);
  /** Zoomed out: a dot for each beast and sheep, where the mob is not too crowded to read as dots. */
  private dots = new ParticleContainer<Particle>({
    dynamicProperties: { position: true, vertex: true, rotation: false, uvs: false, color: false },
  });
  /** Each beast's dot, or null while its mob shows as a patch. */
  private beastDots: (Particle | null)[] = [];
  private farKey = '';
  /** The zoom the animal sizes were last set for. */
  private sizedZoom = 0;
  /** The marker and badge of each mob, so they follow the herd as it drifts. */
  private herdPins = new Map<number, PinnedLabel[]>();
  private wakeTimer: ReturnType<typeof setTimeout> | null = null;
  /** When the cattle last stopped drawing frames because all of them were standing, or 0. */
  private cattleRestFrom = 0;
  private readonly rowDirty = new Uint8Array(GRID_H);
  private readonly onVisibility = (): void => {
    if (typeof document !== 'undefined' && !document.hidden) this.invalidate();
  };
  private flockPlacements: FlockPlacement[] = [];
  private sheepDrawn = 0;
  private pinned: PinnedLabel[] = [];
  private padLabels: PadLabel[] = [];
  private keys = { placement: '', things: '', fences: '', labels: '' };

  private vp: Viewport = { width: 1, height: 1 };
  private cam: Camera = { zoom: 10, x: WORLD_W / 2, y: WORLD_H / 2 };
  /** The picture showing, and how strongly each of the two shows while one fades to the other. */
  private lod: { mode: LodMode; near: number; far: number } = { mode: 'far', near: 0, far: 1 };
  /** The fade between the two pictures: 0 is all zoomed-out map, 1 is all detail. */
  private nearMix = 0;
  private lodStarted = false;
  private fenceBucket = 0;
  private pixelRatio = 1;
  private readonly maxPixelRatio: number;
  private readonly font: string;
  private minutes: number | null = null;
  private weather: MapWeather = { kind: 'clear' };
  private highlight: number | null = null;
  private pickable: readonly PickablePaddock[] | null = null;
  private hoverPaddock: number | null = null;
  private hoverSquare = -1;
  private ambient: boolean;
  private reduceMotion: boolean;
  private everyBeast: boolean;

  private raf = 0;
  private lastFrameAt = 0;
  private framesDrawn = 0;
  /** 1 for each row whose standing grass is waiting to be rebuilt. */
  private readonly tuftsStale = new Uint8Array(GRID_H);
  /** 1 for each row of squares whose ground is waiting to be repainted. */
  private readonly groundStale = new Uint8Array(GRID_H);
  private lastViewMs = 0;
  private lastViewParts: Record<string, number> = {};
  private slowFrames: number[] = [];
  private lastDrawnAt = 0;
  private lastStepDown = 0;
  private input: InputHandle | null = null;
  private observer: ResizeObserver | null = null;
  private destroyed = false;

  constructor(
    private readonly host: HTMLElement,
    private readonly options: FarmMapOptions,
  ) {
    this.palette = paletteFor(options.theme ?? 'dark');
    this.layers = withLayers(DEFAULT_LAYERS, options.layers ?? {});
    this.maxPixelRatio = options.maxPixelRatio ?? 2;
    this.font = options.fontFamily ?? DEFAULT_FONT;
    this.ambient = options.ambient ?? false;
    this.everyBeast = options.everyBeast ?? false;
    this.reduceMotion =
      options.reduceMotion ??
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  get canvas(): HTMLCanvasElement {
    return this.app.canvas;
  }

  // -------------------------------------------------------------------------
  // Start up
  // -------------------------------------------------------------------------

  async start(): Promise<void> {
    const { host } = this;
    this.vp = { width: Math.max(1, host.clientWidth), height: Math.max(1, host.clientHeight) };
    this.pixelRatio = Math.min(Math.max(1, window.devicePixelRatio || 1), this.maxPixelRatio);
    await this.app.init({
      width: this.vp.width,
      height: this.vp.height,
      backgroundColor: this.palette.ui.surround,
      antialias: true,
      autoDensity: true,
      resolution: this.pixelRatio,
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
      powerPreference: 'high-performance',
      // The map handles its own input. PixiJS need not track pointers.
      eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
    });
    if (this.destroyed) return;
    this.app.ticker.stop();
    const canvas = this.app.canvas;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.cursor = 'grab';
    canvas.tabIndex = 0;
    // It takes the keyboard (arrows move, plus and minus zoom, 0 shows it all).
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-roledescription', 'map');
    canvas.setAttribute(
      'aria-label',
      (this.options.label ?? 'Map of the farm') +
        '. Arrow keys move it. Plus and minus zoom. 0 shows the whole farm.',
    );
    host.appendChild(canvas);

    this.buildAtlas(this.options.sprites ?? defaultSprites());
    this.buildScene();

    this.input = attachInput(canvas, {
      mode: () => this.inputMode(),
      drag: (phase, p) => this.onDrag(phase, p),
      camera: () => this.cam,
      viewport: () => this.vp,
      moveTo: (cam) => this.setCamera(cam),
      tap: (x, y) => this.onTap(x, y),
      hover: (p) => this.onHover(p),
      inset: () => this.inset,
      // A finger has no hover: in a tool, pressing shows what is under it, as the mouse does.
      press: (p) => {
        if (this.tool !== 'look') this.onHover(p);
      },
      fit: () => this.fitFarm(),
    });
    if (this.options.autoResize !== false && typeof ResizeObserver === 'function') {
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(host);
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibility);
    }
    this.cam = fitCamera(this.vp, this.options.fit ?? 'auto');
    if (this.options.view) this.setView(this.options.view);
    else this.applyCamera();
  }

  /** Draw every sprite once onto one sheet. */
  private buildAtlas(reg: SpriteRegistry): void {
    const ids = reg.ids();
    const layout = packAtlas(
      ids.map((id) => ({ id, w: reg.get(id)!.w, h: reg.get(id)!.h })),
      2048,
    );
    const sheet = makeCanvas(layout.width, layout.height);
    const ctx = sheet.getContext('2d')!;
    for (const id of ids) {
      const def = reg.get(id)!;
      const f = layout.frames.get(id)!;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.beginPath();
      ctx.rect(0, 0, f.w, f.h);
      ctx.clip();
      if (def.image) ctx.drawImage(def.image, 0, 0, f.w, f.h);
      else def.paint?.(ctx, f.w, f.h);
      ctx.restore();
      this.defs.set(id, def);
    }
    const source = new CanvasSource({
      resource: sheet,
      scaleMode: 'linear',
      autoGenerateMipmaps: true,
    });
    for (const id of ids) {
      const f = layout.frames.get(id)!;
      this.textures.set(id, new Texture({ source, frame: new Rectangle(f.x, f.y, f.w, f.h) }));
    }
  }

  private tex(id: string): Texture {
    const t = this.textures.get(id);
    if (!t) throw new Error(`The map has no sprite called "${id}".`);
    return t;
  }

  private def(id: string): SpriteDef {
    return this.defs.get(id)!;
  }

  /** A sprite from the sheet, sized in world units and anchored on its ground spot. */
  private sprite(id: string, wx: number, wy: number, flip = false): Sprite {
    const def = this.def(id);
    const s = new Sprite(this.tex(id));
    s.anchor.set(def.ax, def.ay);
    s.scale.set((flip ? -1 : 1) / def.ppu, 1 / def.ppu);
    s.position.set(wx, wy);
    return s;
  }

  private buildScene(): void {
    const { world } = this;
    this.groundCanvas = makeCanvas(GROUND_W, GROUND_H);
    this.groundPixels = new ImageData(GROUND_W, GROUND_H);
    this.groundSprite = new Sprite(
      new Texture({
        source: new CanvasSource({ resource: this.groundCanvas, scaleMode: 'linear' }),
      }),
    );
    this.groundSprite.setSize(WORLD_W, WORLD_H);

    world.addChild(this.base, this.groundSprite, this.far);
    for (const layer of WASH_LAYERS) {
      const canvas = makeCanvas(GRID_W, GRID_H);
      const sprite = new Sprite(
        new Texture({ source: new CanvasSource({ resource: canvas, scaleMode: 'linear' }) }),
      );
      sprite.setSize(WORLD_W, WORLD_H);
      sprite.visible = false;
      world.addChild(sprite);
      this.washes.set(layer, { sprite, canvas, dirty: true });
    }
    this.dots.boundsArea = new Rectangle(-2, -3, WORLD_W + 4, WORLD_H + 6);
    world.addChild(this.pipeG, this.footprints, this.dots, this.ring, this.outlines);
    // The build grid sits under the fences, so the fences it lights up stay on top.
    world.addChild(this.gridG, this.gridNearG);
    world.addChild(this.fenceFar, this.fenceNear);

    const still = { position: false, vertex: false, rotation: false, uvs: false, color: false };
    const moving = { position: true, vertex: true, rotation: false, uvs: false, color: false };
    for (let r = 0; r < GRID_H; r++) {
      const row: Row = {
        line: new Container(),
        tufts: new ParticleContainer<Particle>({ dynamicProperties: still }),
        things: new Container(),
        // Cattle walk: their positions and sizes (facing) change each frame.
        cattle: new ParticleContainer<Particle>({ dynamicProperties: moving }),
        tuftCount: 0,
      };
      // Particle batches do not work out their own bounds. The whole farm will do.
      const bounds = new Rectangle(-2, -3, WORLD_W + 4, WORLD_H + 6);
      row.tufts.boundsArea = bounds;
      row.cattle.boundsArea = bounds;
      // A row's cattle go in after the grass of the row in front of them,
      // so a beast drawn near its real size never hides in tall grass
      // (VISUALS: cattle never blur into the grass), and before the things
      // in that row, so a trough or the windmill in front still covers them.
      const behind = this.rows[r - 1];
      world.addChild(row.line, row.tufts);
      if (behind) world.addChild(behind.cattle);
      world.addChild(row.things);
      this.rows.push(row);
    }
    world.addChild(this.rows[GRID_H - 1]!.cattle);

    // The draft and the hover sit on top of everything standing on the farm.
    world.addChild(this.contractG, this.draftG, this.hoverG);
    this.rain.boundsArea = new Rectangle(0, 0, 4096, 4096);
    this.rain.visible = false;
    this.ui.addChild(this.labelLayer, this.buildUi, this.rain);
    this.surroundCanvas = makeCanvas(SURROUND_TILE, SURROUND_TILE);
    this.surround = new TilingSprite({
      texture: new Texture({
        source: new CanvasSource({
          resource: this.surroundCanvas,
          scaleMode: 'linear',
          addressMode: 'repeat',
        }),
      }),
      width: this.vp.width,
      height: this.vp.height,
    });
    this.app.stage.addChild(this.surround, world, this.ui);
    this.drawBase();
  }

  private drawBase(): void {
    this.drawSurround();
    this.base
      .clear()
      .rect(-0.12, -0.12, WORLD_W + 0.24, WORLD_H + 0.24)
      .fill(this.palette.ui.farmEdge);
  }

  /** Paint the bush tile in the theme's colours. */
  private drawSurround(): void {
    const canvas = this.surroundCanvas;
    if (!canvas || !this.surround) return;
    const img = new ImageData(SURROUND_TILE, SURROUND_TILE);
    paintSurround(this.palette.ui.surround, this.palette.ui.surroundSpeck, img.data);
    canvas.getContext('2d')!.putImageData(img, 0, 0);
    this.surround.texture.source.update();
  }

  // -------------------------------------------------------------------------
  // Drawing on demand
  // -------------------------------------------------------------------------

  /** Ask for one frame. Nothing is drawn until something asks. */
  private invalidate(): void {
    if (this.raf || this.destroyed) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    if (this.destroyed) return;
    const dt = this.lastFrameAt ? Math.min(100, now - this.lastFrameAt) : 16.7;
    this.lastFrameAt = now;
    this.watchSpeed(now);
    const moving = this.animate(now, dt);
    this.app.renderer.render(this.app.stage);
    this.framesDrawn++;
    if (moving) this.invalidate();
    else this.lastFrameAt = 0;
  };

  /** Move whatever moves. Returns true if another frame is needed. */
  private animate(now: number, dt: number): boolean {
    let moving = this.repaintGround(GRASS_BUDGET_MS);
    moving = this.rebuildGrass(GRASS_BUDGET_MS) || moving;
    // The fade between the zoomed-out map and the detail. With reduce motion it is instant.
    const target = this.lod.mode === 'near' ? 1 : 0;
    if (this.nearMix !== target) {
      this.nearMix = fadeStep(this.nearMix, this.lod.mode, dt, this.reduceMotion);
      this.applyLod();
      moving = this.nearMix !== target;
    }
    if (this.reduceMotion) return moving;
    if (this.stepCattle(dt)) moving = true;
    if (this.weather.kind === 'rain') {
      const drops = this.rain.particleChildren;
      for (let k = 0; k < drops.length; k++) {
        const d = drops[k]!;
        const v = this.rainSpeed[k]! * dt;
        d.x -= v * 0.22;
        d.y += v;
        if (d.y > this.vp.height + 30) {
          d.y = -30;
          d.x += (this.vp.height + 60) * 0.22;
        }
        if (d.x < -20) d.x += this.vp.width + 40;
      }
      moving = true;
    }
    if (this.ambient && this.view) {
      if (this.fan) this.fan.rotation += dt * 0.0022;
      if (this.ring.visible) this.ring.alpha = 0.55 + 0.4 * Math.sin(now / 260);
      moving = moving || this.fan !== null || this.ring.visible;
    }
    return moving;
  }

  /**
   * Repaint stale rows of the ground picture for up to `budgetMs`. When the
   * last is done the picture goes to the screen in one piece. Returns true
   * if rows are still waiting.
   */
  private repaintGround(budgetMs: number): boolean {
    const stale = this.groundStale;
    if (!this.view || !stale.includes(1)) return false;
    const t0 = performance.now();
    for (let r = 0; r < GRID_H; r++) {
      if (!stale[r]) continue;
      if (performance.now() - t0 >= budgetMs) return true;
      // Runs of stale rows are painted together.
      let to = r + 1;
      while (to < GRID_H && stale[to] && to - r < 3) to++;
      paintGround(this.view, this.looks, this.groundPixels.data, r, to);
      stale.fill(0, r, to);
      r = to - 1;
    }
    this.groundCanvas.getContext('2d')!.putImageData(this.groundPixels, 0, 0);
    this.groundSprite.texture.source.update();
    return false;
  }

  /**
   * Rebuild stale rows of standing grass for up to `budgetMs`, rows on screen
   * first. Returns true if rows are still waiting.
   */
  private rebuildGrass(budgetMs: number): boolean {
    const stale = this.tuftsStale;
    if (!stale.includes(1)) return false;
    const t0 = performance.now();
    const [, y0, , y1] = visibleWorld(this.cam, this.vp);
    let built = false;
    for (const wantOnScreen of [true, false]) {
      for (let r = 0; r < GRID_H; r++) {
        if (!stale[r]) continue;
        const onScreen = (r + 1) * K + 0.3 >= y0 && r * K - 2.4 <= y1;
        if (onScreen !== wantOnScreen) continue;
        if (built && performance.now() - t0 >= budgetMs) {
          this.applyLod();
          return true;
        }
        this.buildTufts(r);
        stale[r] = 0;
        built = true;
      }
    }
    this.applyLod();
    return false;
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  private setCamera(cam: Camera): void {
    const next = clampCamera(cam, this.vp, this.inset);
    if (next.zoom === this.cam.zoom && next.x === this.cam.x && next.y === this.cam.y) return;
    this.cam = next;
    this.applyCamera();
    for (const h of this.handlers.camera) h({ ...this.cam });
  }

  /** Put the world where the camera says, and show the right level of detail. */
  private applyCamera(): void {
    const { cam, vp, world } = this;
    world.scale.set(cam.zoom);
    world.position.set(vp.width / 2 - cam.x * cam.zoom, vp.height / 2 - cam.y * cam.zoom);
    // The bush covers the screen and moves with the farm, so a pan never slides the farm over it.
    if (this.surround) {
      const s = surroundScale(cam.zoom);
      this.surround.setSize(vp.width, vp.height);
      this.surround.tileScale.set(s);
      this.surround.tilePosition.set(world.position.x, world.position.y);
    }

    if (cam.zoom !== this.sizedZoom) this.sizeAnimals();
    this.refreshFar();
    const mode = lodMode(cam.zoom, this.lodStarted ? this.lod.mode : undefined);
    // The first picture, and every change with reduce motion on, is shown at once.
    if (!this.lodStarted || this.reduceMotion) this.nearMix = mode === 'near' ? 1 : 0;
    this.lodStarted = true;
    this.lod.mode = mode;
    this.applyLod();

    // Zoomed out, line widths are set in screen pixels, so lines are redrawn
    // when the zoom moves a step (two steps to a doubling). Zoomed in, lines
    // are sized in squares and grow with the zoom, so nothing is redrawn.
    const bucket = mode === 'near' ? NEAR_LINES : Math.round(Math.log2(cam.zoom) * 2);
    if (bucket !== this.fenceBucket) {
      this.fenceBucket = bucket;
      this.drawFences();
      this.drawPipe();
      this.drawOutlines();
      this.drawRing();
    }
    // The build overlay is sized in screen pixels, so it follows the zoom (only the overlay is redrawn).
    if (
      this.overlayZoom !== cam.zoom &&
      (this.draft || this.hoverTool || this.contractor || this.tool !== 'look')
    ) {
      this.drawOverlays();
    }
    this.placeLengthTag();
    this.invalidate();
  }

  /** Show each of the two pictures as strongly as the fade says, and hide what is off screen. */
  private applyLod(): void {
    const { cam, vp } = this;
    const mix = easeFade(this.nearMix);
    const lod = this.lod;
    lod.near = mix;
    lod.far = 1 - mix;
    const near = lod.near > 0.01;
    const far = lod.far > 0.01;
    this.far.visible = far;
    this.far.alpha = lod.far;
    this.fenceFar.visible = far;
    this.fenceFar.alpha = lod.far;
    this.fenceNear.visible = near;
    this.fenceNear.alpha = lod.near;
    this.footprints.visible = far;
    this.footprints.alpha = lod.far;
    this.dots.visible = far && this.dots.particleChildren.length > 0;
    this.dots.alpha = lod.far;

    // Rows off the top or bottom of the screen are not drawn.
    const [, y0, , y1] = visibleWorld(cam, vp);
    for (let r = 0; r < GRID_H; r++) {
      const row = this.rows[r]!;
      const onScreen = (r + 1) * K + 0.3 >= y0 && r * K - 2.4 <= y1;
      row.line.visible = onScreen;
      row.things.visible = onScreen;
      row.tufts.visible = onScreen && near && row.tuftCount > 0;
      row.tufts.alpha = lod.near;
      row.cattle.visible = onScreen && near && row.cattle.particleChildren.length > 0;
      row.cattle.alpha = lod.near;
    }
    this.placeLabels();
  }

  /** One screen pixel in world units, at the zoom step the lines were last drawn for. */
  private px(): number {
    return 1 / Math.pow(2, this.fenceBucket / 2);
  }

  /**
   * Step the pixel ratio down on a screen that is struggling. Frames that
   * follow each other closely are a drag, a pinch or something moving. If a
   * run of them comes slowly, the map draws fewer pixels from then on.
   */
  private watchSpeed(now: number): void {
    const gap = now - this.lastDrawnAt;
    this.lastDrawnAt = now;
    const list = this.slowFrames;
    if (gap > 80) {
      // A pause. Whatever came before was not one run of frames.
      list.length = 0;
      return;
    }
    list.push(gap);
    if (list.length < STRUGGLE.frames) return;
    const slow = struggling(list);
    list.length = 0;
    if (slow && this.pixelRatio > 1 && now - this.lastStepDown > 3000) {
      this.lastStepDown = now;
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.5);
      this.app.renderer.resize(this.vp.width, this.vp.height, this.pixelRatio);
    }
  }

  // -------------------------------------------------------------------------
  // A new view
  // -------------------------------------------------------------------------

  setView(view: FarmView): void {
    if (view.viewVersion !== FARM_VIEW_VERSION) {
      throw new Error(
        `The map draws farm view version ${FARM_VIEW_VERSION}. It was given version ${view.viewVersion}.`,
      );
    }
    const t0 = performance.now();
    const first = this.view === null;
    const prevLooks = this.looks;
    this.view = view;
    this.looks = allLooks(view);
    for (let i = 0; i < GRID_N; i++) this.raise[i] = this.looks[i]!.raise;

    // The ground and the zoomed-out fields: repainted only if a square changed.
    const changedRows: boolean[] = [];
    let anyChanged = first;
    for (let r = 0; r < GRID_H; r++) {
      let changed = first;
      for (let c = 0; c < GRID_W && !changed; c++) {
        const i = r * GRID_W + c;
        changed = !prevLooks[i] || !sameLook(prevLooks[i]!, this.looks[i]!);
      }
      changedRows.push(changed);
      anyChanged = anyChanged || changed;
    }
    const fencesKey = JSON.stringify([view.fences, view.gates, view.squares.paddock]);
    const fencesChanged = fencesKey !== this.keys.fences;
    const parts: Record<string, number> = {};
    let mark = performance.now();
    const lap = (name: string): void => {
      const now = performance.now();
      parts[name] = Math.round((now - mark) * 10) / 10;
      mark = now;
    };
    lap('looks');
    if (anyChanged || fencesChanged) {
      // The ground picture: painted at once for the first view. After that
      // the changed rows (and the rows either side, which blend into them)
      // are repainted a few a frame, so a new day never holds the page up.
      // Until they are all done the map shows yesterday's ground.
      for (let r = 0; r < GRID_H; r++) {
        const near = fencesChanged || changedRows[r] || changedRows[r - 1] || changedRows[r + 1];
        if (near) this.groundStale[r] = 1;
      }
      if (first) this.repaintGround(Infinity);
      lap('ground');
      this.drawFar();
      lap('fields');
    }
    // The standing grass is rebuilt a few rows a frame, so a new day never
    // holds the page up. Until a row is rebuilt it shows yesterday's grass.
    for (let r = 0; r < GRID_H; r++) if (changedRows[r]) this.tuftsStale[r] = 1;

    if (fencesChanged) {
      this.keys.fences = fencesKey;
      this.drawFences();
      this.drawOutlines();
      // The fences a line joins to are lit while building, so they follow a new fence.
      if (this.tool !== 'look') this.drawGrid();
    }
    const thingsKey = JSON.stringify([
      view.water,
      view.buildings,
      view.trees,
      view.gates,
      fencesKey,
    ]);
    if (thingsKey !== this.keys.things) {
      this.keys.things = thingsKey;
      this.buildThings();
      this.drawPipe();
      this.drawRing();
    }
    lap('fencesAndThings');
    const placement =
      placementKey(view) + view.district + this.everyBeast + sheepPlacementKey(view);
    if (placement !== this.keys.placement) {
      this.keys.placement = placement;
      this.placements = placeCattle(view, { everyBeast: this.everyBeast });
      this.flockPlacements = placeSheep(view, { everyBeast: this.everyBeast });
      this.buildCattle();
    } else {
      // The same cattle: they keep walking, drawn to today's feed.
      this.herd.feed(view);
      // The squares may stand taller or shorter: the dots and patches sit on them afresh.
      if (anyChanged) this.farKey = '';
    }
    lap('cattle');
    const labelsKey = JSON.stringify([
      view.paddocks.map((p) => [p.id, p.name, p.ha, p.labelCell, p.label, p.water]),
      view.plantings.map((p) => [p.id, p.name, p.labelCell, p.squares, p.selfSown, p.oversown]),
      view.mobs.map((m) => [m.id, m.head, m.calves, m.status.noWater]),
      (view.flocks ?? []).map((f) => [f.id, f.head, f.lambs, f.status.noWater]),
      view.water.troughs.length + view.water.hubs.length,
      placement,
    ]);
    if (labelsKey !== this.keys.labels) {
      this.keys.labels = labelsKey;
      this.buildLabels();
      this.drawContractTag();
    }
    for (const w of this.washes.values()) w.dirty = true;
    this.refreshWashes();
    this.applyLight();
    this.applyCamera();
    lap('labelsAndRest');
    this.lastViewParts = parts;
    this.lastViewMs = performance.now() - t0;
  }

  /** The zoomed-out picture: each square one clean colour, raised by its grass height. */
  private drawFar(): void {
    const g = this.far.clear();
    const looks = this.looks;
    for (let r = 0; r < GRID_H; r++) {
      for (let c = 0; c < GRID_W; c++) {
        const i = r * GRID_W + c;
        const look = looks[i]!;
        const top = r * K - look.raise;
        // A hair of overlap, so no seams show between squares.
        g.rect(c, top, 1.02, K + 0.02).fill(look.field);
        if (look.rows) {
          // Cultivated rows read from a distance too.
          const line = shade(look.field, look.kind === 'stubble' ? 1.12 : 0.8);
          for (let k = 0; k < 3; k++)
            g.rect(c, top + (K * (k + 0.2)) / 3, 1.02, K * 0.07).fill(line);
        }
        if (farSeedFlecks(look)) {
          // Seed heads read from a distance as pale flecks across the square.
          // Each square scatters its three a little differently, the same way
          // every time, so a paddock does not read as a grid of dots.
          for (let k = 0; k < 3; k++) {
            const dx = ((i * 37 + k * 17) % 11) / 11;
            const dy = ((i * 53 + k * 29) % 13) / 13;
            g.rect(c + 0.08 + 0.3 * k + 0.16 * dx, top + K * (0.12 + 0.62 * dy), 0.1, K * 0.1).fill(
              look.seed,
            );
          }
        }
        // The front of a raised square shows where it stands taller than the
        // one in front of it: green from the ground up, dry feed above.
        const next = r + 1 < GRID_H ? looks[i + GRID_W]!.raise : 0;
        for (const band of farFrontBands(look, next)) {
          g.rect(c, (r + 1) * K - band.to, 1.02, band.to - band.from).fill(band.colour);
        }
      }
    }
  }

  /** The standing grass on one row of squares. */
  private buildTufts(r: number): void {
    const row = this.rows[r]!;
    const tufts: Tuft[] = [];
    for (let c = 0; c < GRID_W; c++)
      squareTufts(r * GRID_W + c, this.looks[r * GRID_W + c]!, tufts);
    // Back to front.
    tufts.sort((a, b) => a.y - b.y);
    const list = row.tufts.particleChildren;
    let n = 0;
    const put = (
      id: string,
      x: number,
      y: number,
      w: number,
      h: number,
      tint: number,
      sized: boolean,
    ): void => {
      const tex = this.tex(id);
      const def = this.def(id);
      let p = list[n];
      if (!p) {
        p = new Particle(tex);
        list.push(p);
      }
      p.texture = tex;
      p.x = x;
      p.y = y;
      p.anchorX = def.ax;
      p.anchorY = def.ay;
      // Grass pieces stretch to the size the model gives. Seed heads keep their own size.
      p.scaleX = sized ? w / def.w : 1 / def.ppu;
      p.scaleY = sized ? h / def.h : 1 / def.ppu;
      p.tint = tint;
      n++;
    };
    for (const t of tufts) {
      const y = t.y * K;
      if (t.shape === 'stubble') {
        put('tuft.stubble', t.x, y, t.w, t.h, t.straw, true);
        continue;
      }
      const piece = t.shape === 'crop' ? 'tuft.crop' : null;
      // Dry stems behind, at full height. Green in front, from the ground up.
      if (t.greenH < t.h * 0.96)
        put(piece ?? `tuft.dry.${t.variant}`, t.x, y, t.w, t.h, t.straw, true);
      if (t.greenH > 0.012) {
        put(piece ?? `tuft.leaf.${t.variant}`, t.x, y + 0.002, t.w, t.greenH, t.leaf, true);
      }
      if (t.seed >= 0) put('tuft.seed', t.x, y - t.h * 0.92, 0, 0, t.seed, false);
      else if (t.clover) put('tuft.clover', t.x, y - t.greenH * 0.9, 0, 0, NATURAL.clover, false);
    }
    list.length = n;
    row.tuftCount = n;
    row.tufts.update();
  }

  /**
   * The cattle and sheep, zoomed in, and their dots zoomed out. Cattle
   * already on the map keep their places (herd.ts), so a new day never
   * reshuffles them.
   */
  private buildCattle(): void {
    const view = this.view!;
    const breed = breedFor(view.district);
    const herd = this.herd;
    herd.sync(view, this.placements);
    if (this.reduceMotion) herd.settle();
    for (const row of this.rows) row.cattle.particleChildren.length = 0;

    const n = herd.n;
    this.beastParts = new Array<Particle>(n);
    this.beastRow = new Int16Array(n);
    this.beastLen = new Float32Array(n);
    this.beastTex = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const kind = herd.kind[i]!;
      const id = cattleSprite(breed, kind, herd.shape[i]!);
      const def = this.def(id);
      const p = new Particle(this.tex(id));
      p.anchorX = def.ax;
      p.anchorY = def.ay;
      p.x = herd.x[i]!;
      p.y = herd.y[i]! * K;
      this.beastParts[i] = p;
      this.beastLen[i] = CATTLE_LENGTH_M[kind] / CATTLE_LENGTH_M.cow;
      this.beastTex[i] = def.w / CATTLE_W_PER_BODY;
      const r = rowFor(herd.y[i]!);
      this.beastRow[i] = r;
      this.rows[r]!.cattle.particleChildren.push(p);
    }
    // Sheep stand in the same layer, so they sort back to front with the
    // cattle, sized by the same rule. They do not walk yet.
    const sheep: { x: number; y: number; id: string; flip: boolean; len: number }[] = [];
    for (const f of this.flockPlacements) {
      for (const s of f.sheep) {
        sheep.push({
          x: s.x,
          y: s.y,
          id: sheepSprite(s.kind, s.thin),
          flip: s.flip,
          len: SHEEP_LENGTH_M[s.kind] / CATTLE_LENGTH_M.cow,
        });
      }
    }
    this.sheepDrawn = sheep.length;
    this.sheepParts = new Array<Particle>(sheep.length);
    this.sheepLen = new Float32Array(sheep.length);
    this.sheepTex = new Float32Array(sheep.length);
    sheep.forEach((s, k) => {
      const def = this.def(s.id);
      const p = new Particle(this.tex(s.id));
      p.anchorX = def.ax;
      p.anchorY = def.ay;
      p.x = s.x;
      p.y = s.y * K;
      p.scaleX = s.flip ? -1 : 1;
      this.sheepParts[k] = p;
      this.sheepLen[k] = s.len;
      this.sheepTex[k] = def.w / SHEEP_W_PER_BODY;
      this.rows[rowFor(s.y)]!.cattle.particleChildren.push(p);
    });
    for (const row of this.rows) {
      row.cattle.particleChildren.sort((a, b) => a.y - b.y);
      row.cattle.update();
    }
    this.sizeAnimals();
    this.refreshFar(true);
  }

  /**
   * Size every animal for the zoom: near its real length against the paddock
   * (cattle.ts, `cowPx`), and the dots a steady few pixels across.
   */
  private sizeAnimals(): void {
    const zoom = this.cam.zoom;
    this.sizedZoom = zoom;
    const cow = cowPx(zoom, this.view?.scale.sideM ?? 100);
    const dir = this.herd.dir;
    for (let i = 0; i < this.beastParts.length; i++) {
      const p = this.beastParts[i]!;
      const s = Math.max(ANIMAL_MIN_PX, cow * this.beastLen[i]!) / zoom / this.beastTex[i]!;
      p.scaleY = s;
      p.scaleX = dir[i]! < 0 ? -s : s;
    }
    for (let k = 0; k < this.sheepParts.length; k++) {
      const p = this.sheepParts[k]!;
      const s = Math.max(ANIMAL_MIN_PX, cow * this.sheepLen[k]!) / zoom / this.sheepTex[k]!;
      p.scaleY = s;
      p.scaleX = p.scaleX < 0 ? -s : s;
    }
    const d = DOT_PX / zoom / this.def(DOT_SPRITE.cattle).w;
    for (const p of this.dots.particleChildren) {
      p.scaleX = d;
      p.scaleY = d;
    }
  }

  /** Put each beast's sprite where the herd says, keep each row back to front, and move the dots. */
  private placeBeasts(force = false): void {
    const herd = this.herd;
    const dirty = this.rowDirty;
    dirty.fill(0);
    let joined = false;
    for (let i = 0; i < herd.n; i++) {
      const p = this.beastParts[i];
      if (!p) continue;
      const x = herd.x[i]!;
      const wy = herd.y[i]! * K;
      const left = herd.dir[i]! < 0;
      if (!force && p.x === x && p.y === wy && p.scaleX < 0 === left) continue;
      p.x = x;
      p.y = wy;
      p.scaleX = left ? -p.scaleY : p.scaleY;
      const r = rowFor(herd.y[i]!);
      const was = this.beastRow[i]!;
      if (r !== was) {
        const from = this.rows[was]!.cattle.particleChildren;
        const at = from.indexOf(p);
        if (at >= 0) from.splice(at, 1);
        this.rows[r]!.cattle.particleChildren.push(p);
        this.beastRow[i] = r;
        dirty[was] = 2;
        dirty[r] = 2;
      } else if (!dirty[r]) {
        dirty[r] = 1;
      }
    }
    for (let r = 0; r < GRID_H; r++) {
      if (!dirty[r]) continue;
      const row = this.rows[r]!;
      const list = row.cattle.particleChildren;
      // Nearly in order already: an insertion sort is a single pass.
      let swapped = false;
      for (let k = 1; k < list.length; k++) {
        const p = list[k]!;
        let j = k - 1;
        while (j >= 0 && list[j]!.y > p.y) {
          list[j + 1] = list[j]!;
          j--;
        }
        if (j !== k - 1) {
          list[j + 1] = p;
          swapped = true;
        }
      }
      // A new order (or a new member) changes what is in the batch, not just where.
      if (swapped || dirty[r] === 2) row.cattle.update();
      if (dirty[r] === 2) joined = true;
    }
    // A beast walked into a row that was empty: show or hide rows again.
    if (joined) this.applyLod();
    if (this.lod.far > 0.01 || force) this.placeDots();
  }

  /** Each beast's dot over its feet, on the zoomed-out squares (raised by their grass). */
  private placeDots(): void {
    const herd = this.herd;
    for (let i = 0; i < herd.n; i++) {
      const d = this.beastDots[i];
      if (!d) continue;
      const x = herd.x[i]!;
      const y = herd.y[i]!;
      d.x = x;
      d.y = y * K - this.raise[cellOf(x, y)]!;
    }
  }

  /**
   * Zoomed out: each mob as dots where its cattle stand far enough apart to
   * read as dots, otherwise as a filled patch over the ground it takes up
   * (the marker carries the head count). A mob on its way to a new paddock
   * shows as dots, so it can be seen going. Rebuilt only when that changes.
   */
  private refreshFar(force = false): void {
    const view = this.view;
    if (!view) return;
    const zoom = this.cam.zoom;
    const sideM = view.scale.sideM;
    const herd = this.herd;
    const mobDots = herd.mobs.map(
      (m) => m.where === 'paddock' && (m.rushing > 0 || herdAsDots(m.herdM2, m.total, zoom, sideM)),
    );
    const flockDots = this.flockPlacements.map(
      (f) => f.cells.length > 0 && herdAsDots(f.herdM2, f.total, zoom, sideM),
    );
    const key =
      herd.mobs.map((m, k) => `${mobDots[k] ? 'd' : 'p'}${m.id}:${m.start}`).join(',') +
      '|' +
      flockDots.map((b) => (b ? 'd' : 'p')).join('');
    if (!force && key === this.farKey) return;
    this.farKey = key;

    const list = this.dots.particleChildren;
    list.length = 0;
    const scale = DOT_PX / zoom / this.def(DOT_SPRITE.cattle).w;
    const make = (id: string, x: number, y: number): Particle => {
      const d = new Particle(this.tex(id));
      d.anchorX = 0.5;
      d.anchorY = 0.5;
      d.scaleX = scale;
      d.scaleY = scale;
      d.x = x;
      d.y = y * K - this.raise[cellOf(x, y)]!;
      list.push(d);
      return d;
    };
    this.beastDots = new Array<Particle | null>(herd.n).fill(null);
    herd.mobs.forEach((m, k) => {
      if (!mobDots[k]) return;
      for (let i = m.from; i < m.to; i++) {
        this.beastDots[i] = make(DOT_SPRITE.cattle, herd.x[i]!, herd.y[i]!);
      }
    });
    this.flockPlacements.forEach((f, k) => {
      if (!flockDots[k]) return;
      for (const s of f.sheep) make(DOT_SPRITE.sheep, s.x, s.y);
    });
    this.dots.update();
    this.dots.visible = this.lod.far > 0.01 && list.length > 0;

    // The footprint under each marker: light under dots, a filled patch for a crowded mob.
    const g = this.footprints.clear();
    const cover = (cells: readonly number[]): void => {
      for (const c of cells) g.rect(colOf(c), rowOf(c) * K - this.raise[c]!, 1.02, K + 0.02);
    };
    herd.mobs.forEach((m, k) => {
      cover(m.cells);
      if (mobDots[k]) g.fill({ color: 0x281a0a, alpha: 0.14 });
      else g.fill({ color: NATURAL.cattleOutline, alpha: m.where === 'yards' ? 0.14 : 0.5 });
    });
    this.flockPlacements.forEach((f, k) => {
      cover(f.cells);
      if (flockDots[k]) g.fill({ color: 0x281a0a, alpha: 0.14 });
      else g.fill({ color: NATURAL.sheepHalo, alpha: 0.55 });
    });
  }

  /** The markers and badges follow each herd's patch. */
  private moveHerdPins(): void {
    for (const m of this.herd.mobs) {
      const pins = this.herdPins.get(m.id);
      if (!pins || pins.length < 2) continue;
      pins[0]!.wx = m.centre.x;
      pins[0]!.wy = (m.centre.y - m.spread.y) * K;
      pins[1]!.wx = m.centre.x;
      pins[1]!.wy = (m.centre.y - m.spread.y) * K - 0.1;
    }
    this.placeLabels();
  }

  /**
   * Walk the cattle on by a frame. Returns true while any on screen moves.
   * When all of them are standing, no frames are drawn until the first one
   * is due to set off again; a hidden page draws none at all.
   */
  private stepCattle(dt: number): boolean {
    const herd = this.herd;
    const view = this.view;
    if (!view || !herd.n) return false;
    if (typeof document !== 'undefined' && document.hidden) {
      this.cattleRestFrom = 0;
      return false;
    }
    const now = performance.now();
    if (this.wakeTimer) {
      clearTimeout(this.wakeTimer);
      this.wakeTimer = null;
    }
    // While no frames were drawn, the standing cattle kept grazing.
    if (this.cattleRestFrom) {
      herd.rest(((now - this.cattleRestFrom) / 1000) * this.cattlePace);
      this.cattleRestFrom = 0;
    }
    const zoom = this.cam.zoom;
    const walk = (WALK_LENGTHS_PER_S * cowPx(zoom, view.scale.sideM)) / zoom;
    const [x0, y0, x1, y1] = visibleWorld(this.cam, this.vp);
    const rect = [x0 - 1, y0 / K - 1, x1 + 1, y1 / K + 3] as const;
    const res = herd.step(Math.min(100, dt) / 1000, this.cattlePace, walk, rect);
    if (res.moved) this.placeBeasts();
    if (res.shifted || res.arrived) {
      this.moveHerdPins();
      this.refreshFar(res.shifted);
    }
    if (!res.moved && Number.isFinite(res.wakeIn)) {
      this.cattleRestFrom = now;
      this.wakeTimer = setTimeout(
        () => {
          this.wakeTimer = null;
          this.invalidate();
        },
        Math.max(16, res.wakeIn * 1000),
      );
    }
    return res.moved;
  }

  /** Everything that stands on the map and is not grass or cattle. */
  private buildThings(): void {
    const view = this.view!;
    for (const row of this.rows) {
      row.things.removeChildren().forEach((c) => c.destroy({ children: true }));
      row.line.removeChildren().forEach((c) => c.destroy({ children: true }));
    }
    this.fan = null;
    const N = NATURAL;
    const at = (row: number): Container =>
      this.rows[Math.min(GRID_H - 1, Math.max(0, row))]!.things;

    for (const cell of view.trees) {
      at(rowOf(cell)).addChild(this.sprite('tree', colOf(cell) + 0.5, (rowOf(cell) + 0.8) * K));
    }
    for (const b of view.buildings) {
      const x = colOf(b.cell) + 0.5;
      const y = (rowOf(b.cell) + 0.9) * K;
      at(rowOf(b.cell)).addChild(this.sprite('building.' + b.kind, x, y));
    }
    // The bore: a windmill about three times a cow's height, so it is easy to find.
    const bx = colOf(view.water.bore) + 0.5;
    const by = (rowOf(view.water.bore) + 0.62) * K;
    const tower = this.def('windmill.tower');
    const boreRow = at(rowOf(view.water.bore));
    boreRow.addChild(this.sprite('windmill.tower', bx, by));
    this.fan = this.sprite('windmill.fan', bx, by - (tower.h * tower.ay - 34) / tower.ppu);
    boreRow.addChild(this.fan);

    const squareHubs = new Set(view.water.squareHubs);
    for (const t of view.water.troughs) {
      const x = colOf(t.cell) + 0.5;
      const y = (rowOf(t.cell) + 0.7) * K;
      const things = at(rowOf(t.cell));
      if (t.kind === 'fixed') {
        // A hub on a square is a trough with a gate on every side: drawn as a hub, so it reads as one.
        if (squareHubs.has(t.cell))
          things.addChild(this.sprite('hub', x, (rowOf(t.cell) + 0.5) * K));
        else things.addChild(this.sprite('trough.fixed', x, y));
        continue;
      }
      things.addChild(this.sprite('trough.portable', x, y));
      // The level bar: green over half, gold over a quarter, orange below.
      const f = Math.max(0, Math.min(1, t.levelPct / 100));
      const bar = new Graphics()
        .roundRect(x - 0.3, y - 0.68, 0.6, 0.1, 0.03)
        .fill(0x1c150f)
        .rect(x - 0.27, y - 0.655, 0.54 * f, 0.05)
        .fill(f > 0.5 ? N.levelHigh : f > 0.25 ? N.levelMid : N.levelLow);
      things.addChild(bar);
    }
    for (const v of view.water.hubs) {
      const [vx, vy] = cornerXY(v);
      at(vy).addChild(this.sprite('hub', vx, vy * K));
    }
    for (const g of view.gates) {
      const state = g.open ? 'open' : 'shut';
      if (g.line === 'h') {
        const vy = Math.floor(g.index / GRID_W);
        const x = g.index % GRID_W;
        this.rows[Math.min(GRID_H - 1, vy)]!.line.addChild(
          this.sprite(`gate.across.${state}`, x, vy * K),
        );
      } else {
        const y = Math.floor(g.index / (GRID_W + 1));
        const vx = g.index % (GRID_W + 1);
        at(y).addChild(this.sprite(`gate.down.${state}`, vx, y * K));
      }
    }
    // A marker on each fence that is lying down.
    for (const run of fenceRuns(view)) {
      if (run.code !== VIEW_FENCE.tapeDown && run.code !== VIEW_FENCE.electricDown) continue;
      const mx = (run.x0 + run.x1) / 2;
      const my = (run.y0 + run.y1) / 2;
      at(Math.floor(my)).addChild(this.sprite('mark.alert', mx, my * K - 0.16));
    }
  }

  /** Fences as lines: simple and bold zoomed out, with posts and raised wires zoomed in. */
  private drawFences(): void {
    const view = this.view;
    const far = this.fenceFar.clear();
    const near = this.fenceNear.clear();
    if (!view) return;
    const N = NATURAL;
    const px = this.px();
    const runs = fenceRuns(view);
    const wire: Record<number, number> = {
      [VIEW_FENCE.boundary]: N.fencePermanent,
      [VIEW_FENCE.permanent]: N.fencePermanent,
      [VIEW_FENCE.electric]: N.fenceElectric,
      [VIEW_FENCE.tape]: N.fenceTape,
      [VIEW_FENCE.electricDown]: N.fenceDown,
      [VIEW_FENCE.tapeDown]: N.fenceDown,
      [VIEW_FENCE.netting]: N.fenceNetting,
    };
    const post: Record<number, number> = {
      [VIEW_FENCE.boundary]: N.fencePostBoundary,
      [VIEW_FENCE.permanent]: N.fencePost,
      [VIEW_FENCE.electric]: N.fencePostElectric,
      [VIEW_FENCE.tape]: N.fencePostTape,
      [VIEW_FENCE.netting]: N.fencePost,
    };
    const nettingRuns = runs.filter((r) => r.code === VIEW_FENCE.netting);
    /**
     * A zigzag worked along a run, `amp` either side of the line and `lift`
     * above the ground: the mesh of sheep netting. Two with opposite phases
     * cross and make diamonds. On a run down the map the swing is sideways.
     */
    const zigzag = (
      g: Graphics,
      r: FenceRun,
      amp: number,
      lift: number,
      step: number,
      phase: number,
    ): void => {
      const len = Math.hypot(r.x1 - r.x0, (r.y1 - r.y0) * K);
      const n = Math.max(2, Math.round(len / step));
      for (let k = 0; k <= n; k++) {
        const a = k / n;
        const side = (k + phase) % 2 === 0 ? 1 : -1;
        const x = r.x0 + (r.x1 - r.x0) * a + (r.across ? 0 : side * amp);
        const y = (r.y0 + (r.y1 - r.y0) * a) * K - lift + (r.across ? side * amp : 0);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    const down = (r: FenceRun): boolean =>
      r.code === VIEW_FENCE.tapeDown || r.code === VIEW_FENCE.electricDown;

    /** A run as a path: straight, dashed for tape, or sagging to the ground where it is down. */
    const path = (g: Graphics, r: FenceRun, lift: number, dashed: boolean): void => {
      if (down(r)) {
        const n = Math.round(Math.abs(r.x1 - r.x0) + Math.abs(r.y1 - r.y0));
        const dx = (r.x1 - r.x0) / n;
        const dy = (r.y1 - r.y0) / n;
        for (let k = 0; k < n; k++) {
          const ax = r.x0 + dx * k;
          const ay = (r.y0 + dy * k) * K;
          g.moveTo(ax, ay - 0.08)
            .lineTo(ax + dx / 2, ay + (dy * K) / 2 - 0.005)
            .lineTo(ax + dx, ay + dy * K - 0.08);
        }
        return;
      }
      const y0 = r.y0 * K - lift;
      const y1 = r.y1 * K - lift;
      if (!dashed) {
        g.moveTo(r.x0, y0).lineTo(r.x1, y1);
        return;
      }
      const len = Math.hypot(r.x1 - r.x0, y1 - y0);
      const dash = Math.max(0.2, 6 * px);
      const gap = dash * 0.6;
      for (let s = 0; s < len; s += dash + gap) {
        const a = s / len;
        const b = Math.min(1, (s + dash) / len);
        g.moveTo(r.x0 + (r.x1 - r.x0) * a, y0 + (y1 - y0) * a).lineTo(
          r.x0 + (r.x1 - r.x0) * b,
          y0 + (y1 - y0) * b,
        );
      }
    };

    // ---- Zoomed out: a dark casing under a coloured line, so every kind reads on any ground.
    for (const r of runs) path(far, r, 0, false);
    far.stroke({ color: N.fenceCasing, width: PX.farCasing * px, alpha: 0.85, cap: 'round' });
    for (const r of runs) if (r.code === VIEW_FENCE.boundary) path(far, r, 0, false);
    far.stroke({ color: N.fenceCasing, width: PX.farBoundaryCasing * px, cap: 'round' });
    if (nettingRuns.length) {
      for (const r of nettingRuns) path(far, r, 0, false);
      far.stroke({
        color: N.fenceCasing,
        width: PX.farNettingCasing * px,
        alpha: 0.9,
        cap: 'round',
      });
    }
    for (const code of Object.keys(wire).map(Number)) {
      let any = false;
      for (const r of runs) {
        if (r.code !== code) continue;
        path(far, r, 0, code === VIEW_FENCE.tape);
        any = true;
      }
      if (!any) continue;
      far.stroke({
        color: wire[code]!,
        width:
          (code === VIEW_FENCE.boundary
            ? PX.farBoundaryWire
            : code === VIEW_FENCE.netting
              ? PX.farNettingWire
              : PX.farWire) * px,
        cap: 'round',
      });
    }
    // The mesh: a fine dark zigzag worked along the netting, a chain-link band zoomed out.
    if (nettingRuns.length) {
      for (const r of nettingRuns) zigzag(far, r, MESH.swingPx * px, 0, MESH.stepPx * px, 0);
      far.stroke({ color: N.fenceCasing, width: MESH.widthPx * px, alpha: 0.9, cap: 'butt' });
    }

    // ---- Zoomed in: a ground shadow, posts every half square, and the wires standing above the ground.
    const w = NEAR_WIRE;
    for (const r of runs) path(near, r, 0, false);
    near.stroke({ color: 0x140c04, width: w * 1.6, alpha: 0.4 });
    for (const code of Object.keys(post).map(Number)) {
      const ph = POST_HEIGHT[code]!;
      const pw = code === VIEW_FENCE.boundary ? 0.05 : 0.042;
      let any = false;
      for (const r of runs) {
        if (r.code !== code) continue;
        const n = Math.round((Math.abs(r.x1 - r.x0) + Math.abs(r.y1 - r.y0)) * 2);
        for (let k = 0; k <= n; k++) {
          const x = r.x0 + ((r.x1 - r.x0) * k) / n;
          const y = (r.y0 + ((r.y1 - r.y0) * k) / n) * K;
          near.rect(x - pw / 2, y - ph, pw, ph);
          any = true;
        }
      }
      if (any) near.fill(post[code]!);
    }
    for (const code of Object.keys(wire).map(Number)) {
      const lifts = WIRE_LIFT[code] ?? [0];
      const mine = runs.filter((r) => r.code === code);
      if (!mine.length) continue;
      const heavy = code === VIEW_FENCE.boundary ? 1.35 : 1;
      for (const lift of lifts) for (const r of mine) path(near, r, lift, false);
      near.stroke({ color: N.fenceCasing, width: w * 2.3 * heavy, alpha: 0.8, cap: 'round' });
      for (const lift of lifts) for (const r of mine) path(near, r, lift, code === VIEW_FENCE.tape);
      near.stroke({ color: wire[code]!, width: w * heavy, cap: 'round' });
    }
    // Netting: a mesh of crossing zigzags between its two wires (diamonds), the pattern no other fence has.
    if (nettingRuns.length) {
      const lifts = WIRE_LIFT[VIEW_FENCE.netting]!;
      const mid = (lifts[0]! + lifts[1]!) / 2;
      for (const phase of [0, 1]) {
        for (const r of nettingRuns) {
          zigzag(near, r, r.across ? (lifts[1]! - lifts[0]!) / 2 : 0.04, mid, 0.09, phase);
        }
      }
      near.stroke({ color: N.fenceCasing, width: w * 1.5, alpha: 0.55, cap: 'butt' });
      for (const phase of [0, 1]) {
        for (const r of nettingRuns) {
          zigzag(near, r, r.across ? (lifts[1]! - lifts[0]!) / 2 : 0.04, mid, 0.09, phase);
        }
      }
      near.stroke({ color: N.fenceNetting, width: w * 0.7, alpha: 0.95, cap: 'butt' });
    }
    this.invalidate();
  }

  /** Pipe: blue where it is joined to the bore, grey where it is not. */
  private drawPipe(): void {
    const g = this.pipeG.clear();
    const view = this.view;
    g.visible = this.layers.pipe;
    if (!view || !this.layers.pipe) return;
    const live = new Uint8Array(GRID_N);
    const wet = new Uint8Array(GRID_N);
    const piped = new Uint8Array(GRID_N);
    for (const i of view.water.pipe) live[i] = wet[i] = piped[i] = 1;
    for (const i of view.water.pipeDry) wet[i] = piped[i] = 1;
    live[view.water.bore] = wet[view.water.bore] = 1;
    for (const t of view.water.troughs) if (t.kind === 'fixed') live[t.cell] = wet[t.cell] = 1;
    const width = PX.pipe * this.px();
    for (const on of [1, 0]) {
      let any = false;
      for (let i = 0; i < GRID_N; i++) {
        if (!wet[i] || live[i] !== on) continue;
        const x = colOf(i) + 0.5;
        const y = (rowOf(i) + 0.5) * K;
        g.circle(x, y, width * 0.9);
        for (const j of [
          colOf(i) < GRID_W - 1 ? i + 1 : -1,
          i + GRID_W < GRID_N ? i + GRID_W : -1,
        ]) {
          if (j < 0 || !wet[j] || !(piped[i] || piped[j])) continue;
          g.moveTo(x, y).lineTo(colOf(j) + 0.5, (rowOf(j) + 0.5) * K);
        }
        any = true;
      }
      if (any) g.stroke({ color: on ? NATURAL.pipe : NATURAL.pipeDry, width, cap: 'round' });
    }
    this.invalidate();
  }

  /** A gold ring round the bore until the first trough or hub is built. */
  private drawRing(): void {
    const g = this.ring.clear();
    const view = this.view;
    const show = !!view && view.water.troughs.length + view.water.hubs.length === 0;
    g.visible = show;
    if (!view || !show) return;
    const x = colOf(view.water.bore) + 0.5;
    const y = (rowOf(view.water.bore) + 0.62) * K;
    g.ellipse(x, y, 1.1, 1.1 * K).stroke({
      color: NATURAL.boreRing,
      width: Math.max(2.4 * this.px(), 0.05),
    });
    g.alpha = 0.9;
  }

  /** The line round the highlighted paddock and the paddock under the mouse. */
  private drawOutlines(): void {
    const g = this.outlines.clear();
    const view = this.view;
    if (!view) return;
    const px = this.px();
    const draw = (paddock: number, colour: number, width: number, alpha: number): void => {
      for (const [x0, y0, x1, y1] of outlineOf((i) => view.squares.paddock[i] === paddock)) {
        g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
      }
      g.stroke({ color: colour, width: width * px, alpha, cap: 'round' });
    };
    // Paddocks a tool can pick: a light tint and outline, and the no-water colour where stock would have none.
    const tint = (paddock: number, colour: number, alpha: number): void => {
      const own = view.squares.paddock;
      for (let i = 0; i < own.length; i++) {
        if (own[i] === paddock) g.rect(i % GRID_W, Math.floor(i / GRID_W) * K, 1, K);
      }
      g.fill({ color: colour, alpha });
    };
    for (const d of pickableDraws(this.pickable, this.highlight)) {
      if (d.kind === 'dry') {
        tint(d.paddock, NATURAL.layerWaterNone, 0.18);
        draw(d.paddock, NATURAL.layerWaterNone, PX.highlight + 1, 0.95);
      } else {
        tint(d.paddock, this.palette.ui.hover, 0.12);
        draw(d.paddock, this.palette.ui.hover, PX.outline + 2, 0.9);
      }
    }
    if (this.hoverPaddock !== null && this.hoverPaddock !== this.highlight) {
      draw(this.hoverPaddock, this.palette.ui.hover, PX.outline, 0.7);
    }
    if (this.highlight !== null) draw(this.highlight, this.palette.ui.highlight, PX.highlight, 1);
    this.invalidate();
  }

  // -------------------------------------------------------------------------
  // Labels and markers (drawn at a steady size, on top of the map)
  // -------------------------------------------------------------------------

  private text(value: string, size: number, colour: number, weight: '500' | '700' = '700'): Text {
    return new Text({
      text: value,
      style: { fontFamily: this.font, fontSize: size, fontWeight: weight, fill: colour },
    });
  }

  /** A rounded pill holding a row of pieces. Returns the pill, centred on its own middle. */
  private pill(
    pieces: Container[],
    opts: { line?: number; pad?: number; gap?: number } = {},
  ): Container {
    const ui = this.palette.ui;
    const pad = opts.pad ?? 6;
    const gap = opts.gap ?? 5;
    let w = pad;
    let h = 0;
    for (const p of pieces) {
      p.position.set(w, 0);
      w += p.width + gap;
      h = Math.max(h, p.height);
    }
    w += pad - gap;
    h += 6;
    for (const p of pieces) p.y = (h - p.height) / 2;
    const bg = new Graphics().roundRect(0, 0, w, h, Math.min(8, h / 2)).fill({
      color: ui.labelBg,
      alpha: ui.labelBgAlpha,
    });
    if (opts.line !== undefined) bg.stroke({ color: opts.line, width: 1.5 });
    const root = new Container();
    root.addChild(bg, ...pieces);
    root.pivot.set(w / 2, h / 2);
    return root;
  }

  /** A paddock label's coloured chip: Green, Mixed, Dry & rank or Short. */
  private chip(word: string, colour: number): Container {
    const ui = this.palette.ui;
    const t = this.text(word, 10, ui.chipText);
    const c = new Container();
    const bg = new Graphics().roundRect(0, 0, t.width + 10, t.height + 2, 7).fill(colour);
    t.position.set(5, 1);
    c.addChild(bg, t);
    return c;
  }

  private buildLabels(): void {
    const view = this.view!;
    const ui = this.palette.ui;
    this.labelLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.contractTag = null;
    this.pinned = [];
    this.padLabels = [];

    const cells = new Map<number, number[]>();
    for (let i = 0; i < GRID_N; i++) {
      const p = view.squares.paddock[i]!;
      let list = cells.get(p);
      if (!list) cells.set(p, (list = []));
      list.push(i);
    }

    // ---- Paddock labels: name and neutral label, then hectares and water.
    for (const p of view.paddocks) {
      const squares = cells.get(p.id) ?? [];
      if (squares.length < 2) continue;
      const label = PADDOCK_LABELS[p.label];
      const colour = Number.parseInt(label.colour.slice(1), 16);
      const ha = p.ha >= 10 ? Math.round(p.ha).toLocaleString('en-AU') : String(p.ha);
      const second: Container[] = [this.text(`${ha} ha`, 10, ui.labelMuted, '500')];
      if (p.water === 'none') second.push(this.text('no water', 10, ui.noWater));
      else if (p.water === 'gate')
        second.push(this.text('water via gate', 10, ui.labelMuted, '500'));
      const top = this.pill([this.text(p.name, 11, ui.labelText), this.chip(label.name, colour)]);
      const under = this.pill(second, { pad: 5 });
      under.y = top.height / 2 + under.height / 2 + 1;
      const full = new Container();
      full.addChild(top, under);
      // Where the two lines do not fit: the paddock's name in full ("Paddock 1",
      // never "P1" or a bare number) and the label's colour. Narrower than
      // that, no label is drawn: a tap still opens the paddock.
      const dot = new Graphics().circle(5, 5, 5).fill(colour);
      const small = this.pill([this.text(p.name, 11, ui.labelText), dot], { pad: 5 });
      const root = new Container();
      root.addChild(full, small);
      this.labelLayer.addChild(root);
      // The label hangs just under the paddock's top fence, clear of the stock and troughs below.
      let hang = p.labelCell;
      while (hang >= GRID_W && view.squares.paddock[hang - GRID_W] === p.id) hang -= GRID_W;
      this.padLabels.push({
        root,
        full,
        small,
        wx: colOf(hang) + 0.5,
        wy: rowOf(hang) * K,
        columns: columnsSpanned(squares),
      });
    }

    const pin = (root: Container, wx: number, wy: number, o: Partial<PinnedLabel> = {}): void => {
      this.labelLayer.addChild(root);
      this.pinned.push({ root, wx, wy, lift: 0, when: 'always', isLabel: false, columns: 0, ...o });
    };

    // ---- The name of what is planted, under the paddock label.
    for (const pl of view.plantings) {
      if (pl.squares < 3 || pl.oversown) continue;
      const name = (pl.selfSown ? 'self-sown ' : '') + pl.name;
      pin(
        this.pill([this.text(name, 10, ui.labelText, '500')], { pad: 5 }),
        colOf(pl.labelCell) + 0.5,
        (rowOf(pl.labelCell) + 0.5) * K,
        { isLabel: true, columns: 4 },
      );
    }

    // ---- The bore's pointer, until the first water is built.
    if (view.water.troughs.length + view.water.hubs.length === 0) {
      pin(
        this.pill([this.text('Bore: put a trough or water hub here', 11, NATURAL.boreRing)]),
        colOf(view.water.bore) + 0.5,
        (rowOf(view.water.bore) + 0.62) * K - 2.25,
        { lift: 12 },
      );
    }

    // ---- Mobs: one marker each zoomed out, a small head-count badge zoomed in.
    // They follow the herd's patch as it drifts round the paddock.
    const mobs = new Map(view.mobs.map((m) => [m.id, m]));
    this.herdPins.clear();
    for (const p of this.placements) {
      const mob = mobs.get(p.mob);
      if (!mob) continue;
      const at = this.herd.mob(p.mob) ?? p;
      const pinsBefore = this.pinned.length;
      const dry = mob.status.noWater;
      const count = mob.head.toLocaleString('en-AU');
      const icon = (size: number): Sprite => {
        const s = new Sprite(this.tex('marker.cow'));
        s.tint = ui.markerText;
        s.setSize(size * 1.5, size);
        return s;
      };
      const big: Container[] = [icon(12), this.text(count, 12, ui.markerText)];
      if (dry) big.push(this.text('no water', 10, ui.noWater));
      pin(
        this.pill(big, { line: dry ? ui.noWater : ui.markerLine, pad: 8 }),
        at.centre.x,
        (at.centre.y - at.spread.y) * K,
        // It sits on the top edge of the herd, so the dots or the patch show under it.
        { when: 'far', lift: FAR_MARKER_LIFT },
      );
      const small: Container[] = [icon(9), this.text(count, 10, ui.markerText)];
      if (dry) small.push(this.text('no water', 10, ui.noWater));
      pin(
        this.pill(small, { line: dry ? ui.noWater : ui.markerLine, pad: 6, gap: 4 }),
        at.centre.x,
        (at.centre.y - at.spread.y) * K - 0.1,
        { when: 'near', lift: 8 },
      );
      this.herdPins.set(p.mob, this.pinned.slice(pinsBefore));
    }

    // ---- Flocks: a woolly marker with the head count and the word "sheep" zoomed out, so a flock is never taken for cattle.
    const flocks = new Map((view.flocks ?? []).map((f) => [f.id, f]));
    for (const p of this.flockPlacements) {
      const flock = flocks.get(p.flock);
      if (!flock) continue;
      const dry = flock.status.noWater;
      const count = flock.head.toLocaleString('en-AU');
      const icon = (size: number): Sprite => {
        const s = new Sprite(this.tex('marker.sheep'));
        s.tint = ui.markerText;
        s.setSize(size * 1.5, size);
        return s;
      };
      const big: Container[] = [icon(12), this.text(count, 12, ui.markerText)];
      big.push(this.text('sheep', 10, ui.labelMuted, '500'));
      if (dry) big.push(this.text('no water', 10, ui.noWater));
      pin(
        this.pill(big, { line: dry ? ui.noWater : ui.markerLine, pad: 8 }),
        p.centre.x,
        p.centre.y * K,
        { when: 'far' },
      );
      const small: Container[] = [icon(9), this.text(count, 10, ui.markerText)];
      if (dry) small.push(this.text('no water', 10, ui.noWater));
      pin(
        this.pill(small, { line: dry ? ui.noWater : ui.markerLine, pad: 6, gap: 4 }),
        p.centre.x,
        (p.centre.y - p.spread.y) * K - 0.35,
        { when: 'near', lift: 8 },
      );
    }
    this.placeLabels();
  }

  /** Put every label and marker where its point on the map is now. */
  private placeLabels(): void {
    const { cam, vp, lod } = this;
    const showLabels = this.layers.labels;
    for (const l of this.padLabels) {
      const widthPx = l.columns * cam.zoom;
      const show = showLabels && widthPx >= PADDOCK_LABEL_MIN_PX;
      l.root.visible = show;
      if (!show) continue;
      const s = worldToScreen(cam, vp, l.wx, l.wy);
      const fits = widthPx >= PADDOCK_LABEL_FULL_PX;
      l.full.visible = fits;
      l.small.visible = !fits;
      // The bore must stay easy to find: a label that would sit over the
      // windmill steps to one side of it.
      let x = s.x;
      if (this.view) {
        const bore = this.view.water.bore;
        const b = worldToScreen(cam, vp, colOf(bore) + 0.5, (rowOf(bore) + 0.62) * K);
        const half = (fits ? l.full.width : l.small.width) / 2 + 0.6 * cam.zoom + 4;
        const overTower = s.y + 34 > b.y - 2 * cam.zoom && s.y < b.y;
        if (overTower && Math.abs(x - b.x) < half) x = b.x + (x >= b.x ? half : -half);
      }
      l.root.position.set(Math.round(x), Math.round(s.y + 15));
    }
    if (this.contractTag && this.contractTagAt) {
      const show = showLabels && cam.zoom >= CONTRACT_TAG_MIN_PX;
      this.contractTag.visible = show;
      if (show) {
        const s = worldToScreen(cam, vp, this.contractTagAt.wx, this.contractTagAt.wy);
        this.contractTag.position.set(Math.round(s.x), Math.round(s.y - 16));
      }
    }
    for (const p of this.pinned) {
      const alpha = p.when === 'far' ? lod.far : p.when === 'near' ? lod.near : 1;
      const show =
        alpha > 0.02 && (!p.isLabel || showLabels) && (!p.columns || p.columns * cam.zoom >= 130);
      p.root.visible = show;
      if (!show) continue;
      const s = worldToScreen(cam, vp, p.wx, p.wy);
      p.root.alpha = alpha;
      p.root.position.set(Math.round(s.x), Math.round(s.y - p.lift));
    }
  }

  // -------------------------------------------------------------------------
  // Layers, light and weather
  // -------------------------------------------------------------------------

  private refreshWashes(): void {
    for (const layer of WASH_LAYERS) {
      const w = this.washes.get(layer)!;
      w.sprite.visible = this.layers[layer];
      if (!this.layers[layer] || !w.dirty || !this.view) continue;
      const img = new ImageData(GRID_W, GRID_H);
      paintWash(this.view, layer, img.data);
      w.canvas.getContext('2d')!.putImageData(img, 0, 0);
      w.sprite.texture.source.update();
      w.dirty = false;
    }
  }

  private applyLight(): void {
    const light = this.view?.light ?? { first: 360, last: 1080 };
    this.world.tint = mapTint(this.minutes, light.first, light.last, this.weather.kind);
    // The country round the farm gets the same light as the farm.
    if (this.surround) this.surround.tint = this.world.tint;
    this.invalidate();
  }

  private buildRain(): void {
    const list = this.rain.particleChildren;
    const raining = this.weather.kind === 'rain';
    this.rain.visible = raining;
    if (!raining) {
      list.length = 0;
      this.rain.update();
      return;
    }
    const next = scatter(0x7a1d);
    const count = Math.min(260, Math.round((this.vp.width * this.vp.height) / 3200));
    const tex = this.tex('rain');
    list.length = 0;
    this.rainSpeed = [];
    for (let k = 0; k < count; k++) {
      list.push(
        new Particle({
          texture: tex,
          x: next() * (this.vp.width + 40) - 20,
          y: next() * (this.vp.height + 60) - 30,
          anchorX: 0.5,
          anchorY: 0.5,
          scaleX: 0.8,
          scaleY: 0.6 + next() * 0.5,
          alpha: 0.35 + next() * 0.4,
        }),
      );
      this.rainSpeed.push(0.55 + next() * 0.35);
    }
    this.rain.update();
  }

  // -------------------------------------------------------------------------
  // Taps and the mouse
  // -------------------------------------------------------------------------

  private hit(x: number, y: number): MapPointerEvent | null {
    if (!this.view) return null;
    // Zoomed out, squares are drawn raised, so the test is made against the raised shapes.
    const raise = this.lod.far > 0.5 ? this.raise : null;
    const h = hitTest(this.view, this.cam, this.vp, x, y, raise);
    return h ? { ...h, x, y } : null;
  }

  private onTap(x: number, y: number): void {
    const view = this.view;
    if (this.tool === 'look') {
      // A fence that is down offers to be put back up. Anything else opens the paddock.
      if (view) {
        const down = nearestEdge(this.cam, this.vp, x, y, TOUCH_PX * 0.7, (e) =>
          isDownCode(fenceCodeAt(view, e)),
        );
        if (down) {
          const e = { edge: down.edge, edgeCode: fenceCodeAt(view, down.edge), x, y };
          for (const fn of this.handlers.fenceTap) fn(e);
          return;
        }
      }
      const h = this.hit(x, y);
      if (!h) return;
      for (const fn of this.handlers.tap) fn(h);
      return;
    }
    if (!view) return;
    const h = this.hit(x, y);
    const edge = nearestEdge(
      this.cam,
      this.vp,
      x,
      y,
      TOUCH_PX,
      (e) => fenceCodeAt(view, e) !== VIEW_FENCE.none,
    );
    const corner = nearestCorner(this.cam, this.vp, x, y, TOUCH_PX);
    const hub = corner ? view.water.hubs.includes(cornerVertex(corner)) : false;
    const squareHub = !!h && view.water.squareHubs.includes(h.square);
    const base: MapPointerEvent = h ?? {
      square: -1,
      col: -1,
      row: -1,
      paddock: -1,
      paddockName: '',
      area: -1,
      x,
      y,
    };
    const e: MapToolTapEvent = {
      ...base,
      edge: edge ? edge.edge : null,
      edgeCode: edge ? fenceCodeAt(view, edge.edge) : VIEW_FENCE.none,
      edgeDistPx: edge ? edge.distPx : Infinity,
      corner: corner ? { vx: corner.vx, vy: corner.vy } : null,
      hub,
      squareHub,
    };
    for (const fn of this.handlers.toolTap) fn(e);
  }

  /** What a one-finger drag does: draws in a drawing tool, pans otherwise. */
  private inputMode(): InputMode {
    return this.tool === 'corners' || this.tool === 'squares' ? 'draw' : 'pan';
  }

  private onDrag(phase: DragPhase, p: Point): void {
    if (!this.view) return;
    let corner: Corner | null = null;
    let square = -1;
    if (this.tool === 'corners') {
      // Always the nearest corner on the farm, so a loose finger still draws.
      const c = nearestCorner(this.cam, this.vp, p.x, p.y);
      corner = c ? { vx: c.vx, vy: c.vy } : null;
      if (!corner) return;
    } else if (this.tool === 'squares') {
      const raise = this.lod.far > 0.5 ? this.raise : null;
      square = squareAtScreen(this.cam, this.vp, p.x, p.y, raise);
      if (square < 0) return;
    } else {
      return;
    }
    // Only a new corner or square is news.
    const key = corner ? `c${corner.vx},${corner.vy}` : `s${square}`;
    if (phase === 'move' && key === this.dragLast) return;
    // The grid is stronger round the finger while it draws.
    this.focusGrid(corner ?? { vx: colOf(square), vy: rowOf(square) });
    this.dragLast = phase === 'end' ? '' : key;
    const e: MapDragEvent = { phase, corner, square, x: p.x, y: p.y };
    for (const fn of this.handlers.drag) fn(e);
  }

  /** The thing under the mouse in a tool, worked out from the tool. */
  private toolTarget(p: Point | null): HoverTarget | null {
    const view = this.view;
    if (!p || !view) return null;
    switch (this.tool) {
      case 'edge': {
        const e = nearestEdge(
          this.cam,
          this.vp,
          p.x,
          p.y,
          TOUCH_PX * 0.7,
          (edge) => fenceCodeAt(view, edge) !== VIEW_FENCE.none,
        );
        return e ? { kind: 'edge', edge: e.edge } : null;
      }
      case 'corners':
      case 'corner': {
        const c =
          this.tool === 'corners'
            ? nearestCorner(this.cam, this.vp, p.x, p.y)
            : nearestCorner(this.cam, this.vp, p.x, p.y, TOUCH_PX);
        return c ? { kind: 'corner', corner: { vx: c.vx, vy: c.vy } } : null;
      }
      case 'square':
      case 'squares': {
        const raise = this.lod.far > 0.5 ? this.raise : null;
        const s = squareAtScreen(this.cam, this.vp, p.x, p.y, raise);
        return s >= 0 ? { kind: 'square', square: s } : null;
      }
      default:
        return null;
    }
  }

  private onHover(p: Point | null): void {
    if (this.tool !== 'look') {
      const next = this.toolTarget(p);
      const was = this.hoverTool;
      const same =
        (!next && !was) ||
        (next &&
          was &&
          next.kind === was.kind &&
          ((next.kind === 'edge' &&
            was.kind === 'edge' &&
            next.edge.line === was.edge.line &&
            next.edge.index === was.edge.index) ||
            (next.kind === 'square' && was.kind === 'square' && next.square === was.square) ||
            (next.kind === 'corner' &&
              was.kind === 'corner' &&
              sameCorner(next.corner, was.corner))));
      if (!same) {
        this.hoverTool = next;
        this.drawHover();
      }
      this.focusGrid(
        !next
          ? null
          : next.kind === 'corner'
            ? next.corner
            : next.kind === 'square'
              ? { vx: colOf(next.square), vy: rowOf(next.square) }
              : edgeCorner(next.edge),
      );
      return;
    }
    const h = p ? this.hit(p.x, p.y) : null;
    const square = h ? h.square : -1;
    if (square === this.hoverSquare) return;
    this.hoverSquare = square;
    const paddock = h ? h.paddock : null;
    if (paddock !== this.hoverPaddock) {
      this.hoverPaddock = paddock;
      this.drawOutlines();
    }
    for (const fn of this.handlers.hover) fn(h);
  }

  // -------------------------------------------------------------------------
  // The handle
  // -------------------------------------------------------------------------

  setLayers(change: Partial<MapLayers>): void {
    this.layers = withLayers(this.layers, change);
    this.refreshWashes();
    this.drawPipe();
    this.placeLabels();
    this.invalidate();
  }

  getLayers(): MapLayers {
    return { ...this.layers };
  }

  setTheme(theme: MapTheme): void {
    if (theme === this.palette.theme) return;
    this.palette = paletteFor(theme);
    this.app.renderer.background.color = this.palette.ui.surround;
    this.drawBase();
    if (this.view) {
      this.buildLabels();
      this.drawContractTag();
      this.drawOutlines();
    }
    this.invalidate();
  }

  setTimeOfDay(minutes: number | null): void {
    this.minutes = minutes;
    this.applyLight();
  }

  setWeather(weather: MapWeather): void {
    this.weather = { kind: weather.kind };
    this.buildRain();
    this.applyLight();
  }

  setHighlight(paddock: number | null): void {
    this.highlight = paddock;
    this.drawOutlines();
  }

  setPickable(paddocks: readonly PickablePaddock[] | null): void {
    this.pickable = paddocks;
    this.drawOutlines();
  }

  setTool(tool: MapTool): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.hoverTool = null;
    this.dragLast = '';
    this.hoverPaddock = null;
    this.hoverSquare = -1;
    this.drawOutlines();
    this.drawHover();
    this.gridFocus = null;
    this.drawGrid();
    this.input?.refreshCursor();
  }

  setInsets(top: number, bottom: number, left = 0, right = 0): void {
    const r = (v: number): number => Math.max(0, Math.round(v));
    const next = { top: r(top), bottom: r(bottom), left: r(left), right: r(right) };
    const was = this.inset;
    if (
      next.top === was.top &&
      next.bottom === was.bottom &&
      next.left === was.left &&
      next.right === was.right
    ) {
      return;
    }
    this.inset = next;
    // Pull the camera back into range if a bar went away.
    this.setCamera(this.cam);
  }

  setDraft(draft: MapDraft | null): void {
    // Nothing to clear, nothing to draw: leave the overlay alone.
    if (!draft && !this.draft) return;
    this.draft = draft;
    this.drawDraft();
  }

  setContractor(fence: ContractorFence | null): void {
    const empty = !fence || (fence.built.length === 0 && fence.left.length === 0);
    const next = empty ? null : fence;
    if (!next && !this.contractor) return;
    if (next && this.contractor && sameContractor(next, this.contractor)) return;
    this.contractor = next;
    this.drawContractor();
  }

  /**
   * The contractor's fence under way, drawn over the fence beneath it: what is
   * built in a solid line, what is still to build dashed, both in the
   * contractor's colour (never red: red is only for what does not fit today).
   */
  private drawContractor(): void {
    const g = this.contractG.clear();
    this.overlayZoom = this.cam.zoom;
    const c = this.contractor;
    if (!c) {
      this.invalidate();
      return;
    }
    const u = 1 / this.cam.zoom;
    const trace = (edges: readonly ViewEdge[], dashed: boolean): void => {
      for (const e of edges) {
        const [x0, y0, x1, y1] = edgeEnds(e);
        if (!dashed) {
          g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
          continue;
        }
        const len = Math.hypot(x1 - x0, (y1 - y0) * K);
        const dash = 7 * u;
        const gap = 5 * u;
        for (let s = 0; s < len; s += dash + gap) {
          const a = s / len;
          const b = Math.min(1, (s + dash) / len);
          g.moveTo(x0 + (x1 - x0) * a, (y0 + (y1 - y0) * a) * K).lineTo(
            x0 + (x1 - x0) * b,
            (y0 + (y1 - y0) * b) * K,
          );
        }
      }
    };
    // Cross ticks, evenly spaced in screen pixels at every zoom: the pattern that
    // tells the team's fence from every other line without colour (linestyle.ts).
    const ticks = (edges: readonly ViewEdge[]): void => {
      const half = (TICK.lengthPx / 2) * u;
      for (const e of edges) {
        const [x0, y0, x1, y1] = edgeEnds(e);
        const across = y0 === y1;
        const len = Math.hypot(x1 - x0, (y1 - y0) * K);
        for (const s of tickOffsets(len / u, TICK.spacingPx)) {
          const a = (s * u) / len;
          const px = x0 + (x1 - x0) * a;
          const py = (y0 + (y1 - y0) * a) * K;
          if (across) g.moveTo(px, py - half).lineTo(px, py + half);
          else g.moveTo(px - half, py).lineTo(px + half, py);
        }
      }
    };
    const colour = NATURAL.fenceContract;
    if (c.left.length) {
      trace(c.left, true);
      g.stroke({ color: NATURAL.fenceCasing, width: 6 * u, alpha: 0.75, cap: 'round' });
      trace(c.left, true);
      g.stroke({ color: colour, width: 3 * u, cap: 'round' });
      ticks(c.left);
      g.stroke({ color: NATURAL.fenceCasing, width: 5 * u, alpha: 0.75, cap: 'butt' });
      ticks(c.left);
      g.stroke({ color: colour, width: 2.4 * u, cap: 'butt' });
    }
    if (c.built.length) {
      trace(c.built, false);
      g.stroke({ color: NATURAL.fenceCasing, width: 7 * u, alpha: 0.9, cap: 'round' });
      trace(c.built, false);
      g.stroke({ color: colour, width: 4 * u, cap: 'round' });
      ticks(c.built);
      g.stroke({ color: NATURAL.fenceCasing, width: 5 * u, alpha: 0.9, cap: 'butt' });
      ticks(c.built);
      g.stroke({ color: colour, width: 2.4 * u, cap: 'butt' });
    }
    this.drawContractTag();
    this.invalidate();
  }

  /** The words "Team fence" on the run, drawn at a steady size once the map is zoomed in enough to read them. */
  private drawContractTag(): void {
    this.contractTag?.destroy({ children: true });
    this.contractTag = null;
    const c = this.contractor;
    const first = c ? (c.built[0] ?? c.left[0]) : undefined;
    if (!first) return;
    const ui = this.palette.ui;
    const [x0, y0, x1, y1] = edgeEnds(first);
    const tag = this.pill([this.text(CONTRACT_TAG, 11, ui.labelText)], {
      line: NATURAL.fenceContract,
      pad: 6,
    });
    this.contractTagAt = { wx: (x0 + x1) / 2, wy: ((y0 + y1) / 2) * K };
    this.contractTag = tag;
    this.labelLayer.addChild(tag);
    this.placeLabels();
  }

  groundToScreen(gx: number, gy: number): Point {
    return worldToScreen(this.cam, this.vp, gx, gy * K);
  }

  /** Both overlays, after a zoom: line widths are set in screen pixels. */
  private drawOverlays(): void {
    this.drawContractor();
    this.drawDraft();
    this.drawHover();
    // The grid only on a zoom step (four to a doubling), so a pinch does not rebuild it every frame.
    if (gridBucket(this.cam.zoom) !== this.gridBucket) this.drawGrid();
  }

  /**
   * The build grid (docs/VISUALS.md, "The grid while building"): the fence
   * lines and corners a tool can use, faint so the grass still reads, with the
   * fences and boundary lit as the things a line joins to. Drawn in screen
   * pixels, once per zoom step, and cleared in Look.
   */
  private drawGrid(): void {
    const g = this.gridG.clear();
    const view = this.view;
    const kind = gridKindFor(this.tool);
    this.gridBucket = gridBucket(this.cam.zoom);
    if (!view || kind === 'none') {
      this.gridBucket = NaN;
      this.gridNearG.clear();
      this.invalidate();
      return;
    }
    const G = BUILD_GRID;
    // Sized for the zoom step, not the exact zoom: within a few per cent of true pixels.
    const zoom = bucketZoom(this.gridBucket);
    const u = 1 / zoom;
    // The fences, gates and boundary: lit softly underneath, so they stand out as what to join or tap.
    const fenced = fencedEdges(view);
    for (const e of fenced) {
      const [x0, y0, x1, y1] = edgeEnds(e);
      g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
    }
    if (fenced.length) {
      g.stroke({
        color: G.haloColour,
        width: (kind === 'fences' ? G.haloWidthPx + 3 : G.haloWidthPx) * u,
        alpha: kind === 'squares' ? G.haloAlpha * 0.5 : G.haloAlpha,
        cap: 'round',
      });
    }
    if (kind !== 'fences') {
      // The lattice: thinned when zoomed out so it never turns to noise.
      const { cols, rows } = gridLines(gridStep(zoom));
      for (const x of cols) {
        if (x === 0 || x === GRID_W) continue;
        g.moveTo(x, 0).lineTo(x, WORLD_H);
      }
      for (const y of rows) {
        if (y === 0 || y === GRID_H) continue;
        g.moveTo(0, y * K).lineTo(WORLD_W, y * K);
      }
      g.stroke({ color: G.lineColour, width: G.lineWidthPx * u, alpha: G.lineAlpha });
      g.rect(0, 0, WORLD_W, WORLD_H).stroke({
        color: G.lineColour,
        width: G.lineWidthPx * 1.5 * u,
        alpha: G.edgeAlpha,
      });
      if (kind === 'lines' && showCornerDots(zoom)) {
        for (let vy = 0; vy <= GRID_H; vy++) {
          for (let vx = 0; vx <= GRID_W; vx++) g.circle(vx, vy * K, G.dotRadiusPx * u);
        }
        g.fill({ color: G.lineColour, alpha: G.dotAlpha });
      }
    }
    if (kind === 'corners') {
      // A hub goes on a fence corner: each one gets a dot to tap.
      const corners = fencedCorners(view);
      for (const c of corners) g.circle(c.vx, c.vy * K, 3.2 * u);
      g.fill({ color: G.haloColour, alpha: 0.85 });
      for (const c of corners) g.circle(c.vx, c.vy * K, 3.2 * u);
      g.stroke({ color: NATURAL.fenceCasing, width: 1.2 * u, alpha: 0.8 });
    }
    this.drawGridNear();
  }

  /** Move the stronger patch of grid to a new corner. Only a change of corner redraws it. */
  private focusGrid(c: Corner | null): void {
    const was = this.gridFocus;
    if ((!c && !was) || (c && was && sameCorner(c, was))) return;
    this.gridFocus = c;
    this.drawGridNear();
  }

  /** The grid round the pointer or finger: every line and corner, stronger, fading out. */
  private drawGridNear(): void {
    const g = this.gridNearG.clear();
    const c = this.gridFocus;
    const kind = gridKindFor(this.tool);
    if (!c || kind === 'none' || kind === 'fences') {
      this.invalidate();
      return;
    }
    const G = BUILD_GRID;
    const u = 1 / bucketZoom(gridBucket(this.cam.zoom));
    const R = G.nearRadius;
    // Three steps of strength, so the patch fades into the faint grid instead of ending in a box.
    for (const [r, a] of [
      [R, G.nearAlpha * 0.35],
      [R - 1, G.nearAlpha * 0.65],
      [R - 2, G.nearAlpha],
    ] as const) {
      for (const e of nearLines(c, r)) {
        const [x0, y0, x1, y1] = edgeEnds(e);
        g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
      }
      g.stroke({ color: G.lineColour, width: G.lineWidthPx * 1.2 * u, alpha: a });
    }
    if (kind === 'lines') {
      for (const p of nearCorners(c, R - 1)) g.circle(p.vx, p.vy * K, G.nearDotRadiusPx * u);
      g.fill({ color: G.lineColour, alpha: G.nearAlpha + 0.2 });
    }
    this.invalidate();
  }

  /** The length of a line being drawn, beside its end, at a steady size. */
  private drawLengthTag(): void {
    this.lengthTag?.destroy({ children: true });
    this.lengthTag = null;
    this.lengthTagAt = null;
    const d = this.draft;
    const view = this.view;
    if (!d || !view || d.kind === 'mark') return;
    // Whole metres a side, as the job card counts them, so the two always agree.
    const side = Math.round(view.scale.sideM);
    let metres = 0;
    if (d.segments.length) {
      metres = d.segments.length * side;
      const end = d.dots[d.dots.length - 1];
      if (end) this.lengthTagAt = { wx: end.vx, wy: end.vy * K };
    } else if (d.squares.length) {
      // Pipe runs from the middle of one square to the next, as the job card counts it.
      metres = (d.squares.length - 1) * side;
      const end = d.squares[d.squares.length - 1]!.cell;
      this.lengthTagAt = { wx: colOf(end) + 0.5, wy: (rowOf(end) + 0.5) * K };
    }
    if (!this.lengthTagAt || metres <= 0) return;
    const ui = this.palette.ui;
    const tag = this.pill([this.text(lengthWords(metres), 13, ui.labelText)], {
      line: DRAFT_COLOUR[d.kind],
      pad: 7,
    });
    this.lengthTag = tag;
    this.buildUi.addChild(tag);
    this.placeLengthTag();
  }

  /** Keep the length beside the end of the line as the map moves. */
  private placeLengthTag(): void {
    const tag = this.lengthTag;
    const at = this.lengthTagAt;
    if (!tag || !at) return;
    const s = worldToScreen(this.cam, this.vp, at.wx, at.wy);
    // Above and to the right of the end, clear of the finger.
    tag.position.set(Math.round(s.x + 6 + tag.width / 2), Math.round(s.y - 24));
  }

  /** The draft of a line about to be built. Only this layer is redrawn. */
  private drawDraft(): void {
    const g = this.draftG.clear();
    this.overlayZoom = this.cam.zoom;
    const d = this.draft;
    if (!d) {
      this.drawLengthTag();
      this.invalidate();
      return;
    }
    const u = 1 / this.cam.zoom;
    const N = NATURAL;
    const own = DRAFT_COLOUR[d.kind];
    const trace = (edges: readonly ViewEdge[], dashed: boolean): void => {
      for (const e of edges) {
        const [x0, y0, x1, y1] = edgeEnds(e);
        if (!dashed) {
          g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
          continue;
        }
        const len = Math.hypot(x1 - x0, (y1 - y0) * K);
        const dash = 7 * u;
        const gap = 4.5 * u;
        for (let s = 0; s < len; s += dash + gap) {
          const a = s / len;
          const b = Math.min(1, (s + dash) / len);
          g.moveTo(x0 + (x1 - x0) * a, (y0 + (y1 - y0) * a) * K).lineTo(
            x0 + (x1 - x0) * b,
            (y0 + (y1 - y0) * b) * K,
          );
        }
      }
    };
    // Red is only for what does not fit today. Taking something away is lilac round white.
    const styleColour = (style: 'ok' | 'late' | 'remove'): number =>
      style === 'ok' ? own : style === 'late' ? N.notToday : N.removeMark;
    for (const style of ['ok', 'late', 'remove'] as const) {
      const edges = d.segments.filter((s) => s.style === style).map((s) => s.edge);
      if (!edges.length) continue;
      const colour = styleColour(style);
      const dashed = style === 'ok' && d.kind === 'tape';
      if (style === 'remove') {
        trace(edges, false);
        g.stroke({ color: N.removeMark, width: 11 * u, alpha: 0.45, cap: 'round' });
      }
      trace(edges, dashed);
      g.stroke({ color: N.fenceCasing, width: 7 * u, alpha: 0.9, cap: 'round' });
      trace(edges, dashed);
      g.stroke({ color: style === 'remove' ? 0xffffff : colour, width: 4 * u, cap: 'round' });
      if (d.kind === 'netting' && style !== 'remove') {
        // The same fine zigzag as the finished netting, so the draft reads as netting, not as a plain line.
        for (const e of edges) {
          const [x0, y0, x1, y1] = edgeEnds(e);
          const len = Math.hypot(x1 - x0, (y1 - y0) * K);
          const n = Math.max(2, Math.round(len / (MESH.stepPx * u)));
          const across = y0 === y1;
          for (let k = 0; k <= n; k++) {
            const a = k / n;
            const swing = (k % 2 === 0 ? 1 : -1) * 1.2 * u;
            const px = x0 + (x1 - x0) * a + (across ? 0 : swing);
            const py = (y0 + (y1 - y0) * a) * K + (across ? swing : 0);
            if (k === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
        }
        g.stroke({ color: N.fenceCasing, width: 1.1 * u, alpha: 0.9, cap: 'butt' });
      }
    }
    // Squares (pipe, or a place for a trough): a tint, then a line through their middles.
    for (const style of ['ok', 'late', 'remove'] as const) {
      const list = d.squares.filter((s) => s.style === style);
      if (!list.length) continue;
      const colour = styleColour(style);
      for (const s of list) g.rect(colOf(s.cell), rowOf(s.cell) * K, 1, K);
      g.fill({ color: colour, alpha: 0.3 });
    }
    for (const style of ['ok', 'late', 'remove'] as const) {
      const links: [number, number][] = [];
      const ring: number[] = [];
      for (let i = 0; i < d.squares.length; i++) {
        const s = d.squares[i]!;
        if (s.style !== style) continue;
        ring.push(s.cell);
        const prev = d.squares[i - 1];
        if (
          prev &&
          Math.abs(colOf(prev.cell) - colOf(s.cell)) +
            Math.abs(rowOf(prev.cell) - rowOf(s.cell)) ===
            1
        ) {
          links.push([prev.cell, s.cell]);
        }
      }
      if (!ring.length) continue;
      const colour = styleColour(style);
      const body = (): void => {
        for (const [a, b] of links) {
          g.moveTo(colOf(a) + 0.5, (rowOf(a) + 0.5) * K).lineTo(
            colOf(b) + 0.5,
            (rowOf(b) + 0.5) * K,
          );
        }
        for (const c of ring) g.circle(colOf(c) + 0.5, (rowOf(c) + 0.5) * K, 2.2 * u);
      };
      body();
      g.stroke({ color: N.fenceCasing, width: 7 * u, alpha: 0.9, cap: 'round' });
      body();
      g.stroke({ color: colour, width: 4 * u, cap: 'round' });
    }
    for (const dot of d.dots) this.drawDot(g, dot, u);
    this.drawLengthTag();
    this.invalidate();
  }

  /** A snap dot: green where a line joins a fence, a white ring on open ground. */
  private drawDot(g: Graphics, dot: DraftDot, u: number): void {
    const x = dot.vx;
    const y = dot.vy * K;
    if (dot.joins) {
      g.circle(x, y, 7 * u).fill(0x58e07a);
      g.circle(x, y, 7 * u).stroke({ color: NATURAL.fenceCasing, width: 2 * u });
    } else {
      g.circle(x, y, 6.5 * u).stroke({ color: NATURAL.fenceCasing, width: 5.5 * u, alpha: 0.9 });
      g.circle(x, y, 6.5 * u).stroke({ color: 0xffffff, width: 2.6 * u });
    }
  }

  /** What the mouse is over in a tool: a segment, a square or a corner, so the player sees what a click will pick. */
  private drawHover(): void {
    const g = this.hoverG.clear();
    this.overlayZoom = this.cam.zoom;
    const h = this.hoverTool;
    if (!h || !this.view) {
      this.invalidate();
      return;
    }
    const u = 1 / this.cam.zoom;
    if (h.kind === 'edge') {
      const [x0, y0, x1, y1] = edgeEnds(h.edge);
      g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
      g.stroke({ color: NATURAL.fenceCasing, width: 9 * u, alpha: 0.9, cap: 'round' });
      g.moveTo(x0, y0 * K).lineTo(x1, y1 * K);
      g.stroke({ color: 0xffffff, width: 5 * u, cap: 'round' });
    } else if (h.kind === 'square') {
      g.rect(colOf(h.square), rowOf(h.square) * K, 1, K).fill({ color: 0xffffff, alpha: 0.14 });
      g.rect(colOf(h.square), rowOf(h.square) * K, 1, K).stroke({
        color: 0xffffff,
        width: 2.5 * u,
      });
    } else {
      this.drawDot(g, { ...h.corner, joins: cornerJoinsFence(this.view, h.corner) }, u);
    }
    // A tap tool gets a clear target ring, so a finger can see what it is about to pick.
    if (this.tool === 'edge' || this.tool === 'square' || this.tool === 'corner') {
      const c = targetCentre(h);
      const r = BUILD_GRID.ringRadiusPx * u;
      g.circle(c.gx, c.gy * K, r).stroke({ color: NATURAL.fenceCasing, width: 5 * u, alpha: 0.8 });
      g.circle(c.gx, c.gy * K, r).stroke({ color: 0xffffff, width: 2.5 * u });
    }
    this.invalidate();
  }

  setAmbient(on: boolean): void {
    this.ambient = on;
    if (!on) this.ring.alpha = 0.9;
    this.invalidate();
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    if (on) {
      // Nothing moves: a mob on its way is put where it was going.
      this.herd.settle();
      this.placeBeasts(true);
      this.refreshFar(true);
    }
    this.invalidate();
  }

  setCattlePace(pace: number): void {
    const next = Number.isFinite(pace) ? Math.max(0, Math.min(16, pace)) : 1;
    if (next === this.cattlePace) return;
    this.cattlePace = next;
    this.invalidate();
  }

  setEveryBeast(on: boolean): void {
    if (on === this.everyBeast) return;
    this.everyBeast = on;
    if (this.view) this.setView(this.view);
  }

  fitFarm(mode: FitMode = this.options.fit ?? 'auto'): void {
    this.setCamera(fitCamera(this.vp, mode));
  }

  zoomTo(pxPerSquare: number, square?: number): void {
    if (square === undefined) {
      this.setCamera(
        zoomAt(this.cam, this.vp, pxPerSquare, this.vp.width / 2, this.vp.height / 2, this.inset),
      );
    } else {
      this.setCamera(
        lookAt(this.vp, pxPerSquare, colOf(square) + 0.5, (rowOf(square) + 0.5) * K, this.inset),
      );
    }
  }

  panBy(dx: number, dy: number): void {
    this.setCamera(panCamera(this.cam, this.vp, dx, dy, this.inset));
  }

  centreOn(square: number): void {
    this.setCamera(
      lookAt(this.vp, this.cam.zoom, colOf(square) + 0.5, (rowOf(square) + 0.5) * K, this.inset),
    );
  }

  getCamera(): Camera {
    return { ...this.cam };
  }

  squareToScreen(square: number): Point {
    return worldToScreen(this.cam, this.vp, colOf(square) + 0.5, (rowOf(square) + 0.5) * K);
  }

  resize(width?: number, height?: number): void {
    if (this.destroyed) return;
    const w = Math.max(1, Math.round(width ?? this.host.clientWidth));
    const h = Math.max(1, Math.round(height ?? this.host.clientHeight));
    if (w === this.vp.width && h === this.vp.height) return;
    this.vp = { width: w, height: h };
    this.app.renderer.resize(w, h, this.pixelRatio);
    // The same middle and zoom, so turning a phone keeps your place (PRD 6.1a).
    this.cam = clampCamera(this.cam, this.vp, this.inset);
    if (this.weather.kind === 'rain') this.buildRain();
    this.applyCamera();
    for (const fn of this.handlers.camera) fn({ ...this.cam });
  }

  on<E extends keyof MapEvents>(event: E, handler: (e: MapEvents[E]) => void): () => void {
    const set = this.handlers[event] as Set<(e: MapEvents[E]) => void>;
    set.add(handler);
    return () => set.delete(handler);
  }

  stats(): MapStats {
    let animalsDrawn = 0;
    let tuftPieces = 0;
    for (const row of this.rows) {
      animalsDrawn += row.cattle.particleChildren.length;
      tuftPieces += row.tuftCount;
    }
    return {
      head: this.view ? this.view.mobs.reduce((t, m) => t + m.head + m.calves, 0) : 0,
      cattleDrawn: animalsDrawn - this.sheepDrawn,
      sheep: this.view ? (this.view.flocks ?? []).reduce((t, f) => t + f.head + f.lambs, 0) : 0,
      sheepDrawn: this.sheepDrawn,
      tuftPieces,
      lastViewMs: Math.round(this.lastViewMs * 10) / 10,
      lastViewParts: { ...this.lastViewParts },
      pixelRatio: this.pixelRatio,
      zoom: Math.round(this.cam.zoom * 10) / 10,
      lod: this.lod.mode,
      framesDrawn: this.framesDrawn,
    };
  }

  /**
   * Move the camera through a set path, drawing every frame, and report the
   * frame times. A third of the run is zoomed out, a third is zoomed in with
   * as much of the farm on screen as fits, and a third zooms in and out
   * through the change of detail.
   *
   * Paced (the default), frames follow the screen, and the figures are what
   * a player would see. Unpaced, frames are drawn back to back and each one
   * waits for the graphics card to finish, so the figure is the whole cost
   * of a frame. That works in a background tab, where the browser holds
   * paced frames back to about one a second.
   */
  bench(options: BenchOptions = {}): Promise<BenchResult> {
    const seconds = options.seconds ?? 6;
    const paced = !options.unpaced;
    const saved = { ...this.cam };
    const frames: number[] = [];
    const draws: number[] = [];
    const parts: [number[], number[], number[]] = [[], [], []];
    const vp = this.vp;
    const lo = minZoom(vp);
    const nearAll = Math.min(MAX_ZOOM, Math.max(31, containZoom(vp)));
    const gl = (this.app.renderer as { gl?: WebGL2RenderingContext }).gl;
    // Finish any ground and grass still waiting, so the run measures a settled map.
    this.repaintGround(Infinity);
    this.rebuildGrass(Infinity);
    const pixel = new Uint8Array(4);
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    /** Draw the frame at point t (0 to 1) of the path. Returns how long it took. */
    const draw = (t: number, now: number, dt: number): number => {
      const sweep = Math.sin(t * Math.PI * 6);
      let cam: Camera;
      if (t < 1 / 3) cam = { zoom: lo * 1.15, x: WORLD_W / 2 + sweep * 3, y: WORLD_H / 2 };
      else if (t < 2 / 3) cam = { zoom: nearAll, x: WORLD_W / 2 + sweep * 16, y: WORLD_H / 2 };
      else {
        const z = lo * Math.pow(Math.max(1.01, 60 / lo), 0.5 + 0.5 * Math.sin(t * Math.PI * 8));
        cam = { zoom: z, x: WORLD_W / 2 + sweep * 6, y: WORLD_H / 2 + sweep };
      }
      const d0 = performance.now();
      this.cam = clampCamera(cam, vp);
      this.applyCamera();
      if (this.raf) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      }
      this.animate(now, dt);
      this.app.renderer.render(this.app.stage);
      // Reading one pixel back makes the graphics card finish the frame first.
      if (!paced && gl && !options.processorOnly)
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      this.framesDrawn++;
      const took = performance.now() - d0;
      draws.push(took);
      parts[t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2].push(took);
      return took;
    };
    return new Promise((resolve) => {
      const finish = (): void => {
        this.cam = clampCamera(saved, vp);
        this.applyCamera();
        const s = this.stats();
        resolve({
          paced,
          frame: frameStats(frames),
          draw: frameStats(draws),
          parts: {
            zoomedOut: frameStats(parts[0]),
            zoomedIn: frameStats(parts[1]),
            zooming: frameStats(parts[2]),
          },
          cattleDrawn: s.cattleDrawn,
          head: s.head,
          tuftPieces: s.tuftPieces,
          pixelRatio: this.pixelRatio,
          width: vp.width,
          height: vp.height,
          seconds,
        });
      };
      if (!paced) {
        // The same path, cut into as many frames as 60 a second would give.
        const total = Math.max(1, Math.round(seconds * 60));
        let k = 0;
        const batch = (): void => {
          if (this.destroyed) return;
          for (let n = 0; n < 6 && k < total; n++, k++) {
            draw(k / total, (k * 1000) / 60, 1000 / 60);
          }
          if (k < total) setTimeout(batch, 0);
          else finish();
        };
        batch();
        return;
      }
      const t0 = performance.now();
      let last = t0;
      const step = (now: number): void => {
        if (this.destroyed) return;
        const t = (now - t0) / (seconds * 1000);
        if (t >= 1) {
          finish();
          return;
        }
        draw(t, now, now - last);
        if (now > t0) frames.push(now - last);
        last = now;
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibility);
    }
    this.input?.detach();
    this.observer?.disconnect();
    for (const set of Object.values(this.handlers)) set.clear();
    const canvas = this.app.renderer ? this.app.canvas : null;
    try {
      this.app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      );
    } catch {
      // The map was torn down before it finished starting. Nothing is left to free.
    }
    canvas?.remove();
  }
}
