import type { FarmView } from '@gg/shared';
import type { Corner } from '@gg/render/lines';
import { runFor, type BuildTool, type HubOn, type PickedJob, type TroughChoice } from './build';
import type { EdgeWire } from './types';

/**
 * What a tap means in a build tool: a job to confirm, a trough to choose
 * what to do with, or nothing (with a short line saying what to tap). The
 * server checks the job when the card is asked for, so a tap that cannot
 * work (a gate on the boundary, a trough away from water) gets the
 * server's plain reason on the card.
 */

/** What the map reports for a tap in a tool. */
export interface TapInfo {
  square: number;
  edge: EdgeWire | null;
  edgeCode: number;
  /** Screen pixels from the tap to that segment. */
  edgeDistPx: number;
  corner: Corner | null;
  hub: boolean;
}

export type TapOutcome =
  | { kind: 'job'; job: PickedJob }
  | { kind: 'choice'; choice: TroughChoice }
  | { kind: 'none'; message: string };

/** The map's fence codes (VIEW_FENCE) that matter here. */
const BOUNDARY = 1;
const TAPE = 4;
const TAPE_DOWN = 6;
const GATE = 7;

const none = (message: string): TapOutcome => ({ kind: 'none', message });

const corner = (c: Corner): number => c.vy * 41 + c.vx;

function removeEdge(view: FarmView, edge: EdgeWire, code: number): TapOutcome {
  const base = { cells: [], corner: null, style: 'remove' } as const;
  if (code === GATE) {
    return {
      kind: 'job',
      job: {
        ...base,
        action: { type: 'removeGate', edge },
        title: 'Take out this gate',
        confirm: 'Take it out',
        edges: [edge],
      },
    };
  }
  if (code === TAPE || code === TAPE_DOWN) {
    return {
      kind: 'job',
      job: {
        ...base,
        action: { type: 'rollUpTape', edge },
        title: 'Roll up this tape',
        confirm: 'Roll it up',
        edges: runFor(view, edge),
      },
    };
  }
  return {
    kind: 'job',
    job: {
      ...base,
      action: { type: 'removeFence', edges: [edge] },
      title: code === BOUNDARY ? 'Take down the boundary' : 'Take down this fence',
      confirm: 'Take it down',
      edges: [edge],
    },
  };
}

export function tapOutcome(
  tool: BuildTool,
  hubOn: HubOn,
  view: FarmView,
  tap: TapInfo,
): TapOutcome {
  const trough = view.water.troughs.find((t) => t.cell === tap.square);
  switch (tool) {
    case 'gate': {
      const edge = tap.edge;
      if (!edge) return none('Tap a fence line to put a gate in it.');
      const gate =
        tap.edgeCode === GATE
          ? view.gates.find((g) => g.line === edge.line && g.index === edge.index)
          : undefined;
      const base = { cells: [], corner: null, style: 'ok', edges: [edge] } as const;
      if (gate) {
        const open = !gate.open;
        return {
          kind: 'job',
          job: {
            ...base,
            action: { type: 'setGate', edge, open },
            title: open ? 'Open this gate' : 'Shut this gate',
            confirm: open ? 'Open it' : 'Shut it',
          },
        };
      }
      return {
        kind: 'job',
        job: {
          ...base,
          action: { type: 'placeGate', edge },
          title: 'Put a gate here',
          confirm: 'Put in a gate',
        },
      };
    }
    case 'trough':
    case 'portable': {
      if (tap.square < 0) return none('Tap a square on the farm.');
      if (tool === 'trough' && trough?.kind === 'fixed') {
        return { kind: 'choice', choice: { kind: 'trough', cell: tap.square, port: 0 } };
      }
      if (tool === 'portable' && trough?.kind === 'portable') {
        return { kind: 'choice', choice: { kind: 'portable', cell: tap.square, port: trough.id } };
      }
      const portable = tool === 'portable';
      return {
        kind: 'job',
        job: {
          action: portable
            ? { type: 'placePortable', cell: tap.square }
            : { type: 'placeTrough', cell: tap.square },
          title: portable ? 'Set down a portable trough' : 'Put a trough here',
          confirm: portable ? 'Set it down' : 'Put it in',
          edges: [],
          cells: [tap.square],
          corner: null,
          style: 'ok',
        },
      };
    }
    case 'hub': {
      if (hubOn === 'corner') {
        if (!tap.corner) return none('Tap a fence corner.');
        if (tap.hub) return none('There is a water hub here already. Use Remove to take it out.');
        return {
          kind: 'job',
          job: {
            action: { type: 'placeFenceHub', vertex: corner(tap.corner) },
            title: 'Put a water hub on this corner',
            confirm: 'Put it in',
            edges: [],
            cells: [],
            corner: tap.corner,
            style: 'ok',
          },
        };
      }
      if (tap.square < 0) return none('Tap a square on the farm.');
      return {
        kind: 'job',
        job: {
          action: { type: 'placeSquareHub', cell: tap.square },
          title: 'Put a water hub on this square',
          confirm: 'Put it in',
          edges: [],
          cells: [tap.square],
          corner: null,
          style: 'ok',
        },
      };
    }
    case 'remove': {
      if (tap.hub && tap.corner) {
        return {
          kind: 'job',
          job: {
            action: { type: 'removeHub', vertex: corner(tap.corner) },
            title: 'Take out this water hub',
            confirm: 'Take it out',
            edges: [],
            cells: [],
            corner: tap.corner,
            style: 'remove',
          },
        };
      }
      // A segment right under the finger wins. Then a trough on the square, then a segment a little way off.
      if (tap.edge && tap.edgeDistPx <= 10) return removeEdge(view, tap.edge, tap.edgeCode);
      if (trough) {
        const portable = trough.kind === 'portable';
        return {
          kind: 'job',
          job: {
            action: portable
              ? { type: 'removePortable', port: trough.id }
              : { type: 'removeTrough', cell: trough.cell },
            title: portable ? 'Sell this portable trough back' : 'Take out this trough',
            confirm: portable ? 'Sell it back' : 'Take it out',
            edges: [],
            cells: [trough.cell],
            corner: null,
            style: 'remove',
          },
        };
      }
      if (tap.edge) return removeEdge(view, tap.edge, tap.edgeCode);
      return none('Tap a fence, gate, trough or water hub to take it away.');
    }
    default:
      return none('');
  }
}

/** The job for a choice made on a trough: refill it, or take it away. */
export function choiceJob(c: TroughChoice, what: 'refill' | 'remove'): PickedJob {
  const portable = c.kind === 'portable';
  if (what === 'refill') {
    return {
      action: { type: 'refillPortable', port: c.port },
      title: 'Refill this portable trough',
      confirm: 'Refill it',
      edges: [],
      cells: [c.cell],
      corner: null,
      style: 'ok',
    };
  }
  return {
    action: portable
      ? { type: 'removePortable', port: c.port }
      : { type: 'removeTrough', cell: c.cell },
    title: portable ? 'Sell this portable trough back' : 'Take out this trough',
    confirm: portable ? 'Sell it back' : 'Take it out',
    edges: [],
    cells: [c.cell],
    corner: null,
    style: 'remove',
  };
}

/** The job for moving a trough to a square the player tapped. */
export function moveJob(c: TroughChoice, to: number): PickedJob {
  return {
    action:
      c.kind === 'portable'
        ? { type: 'movePortable', port: c.port, cell: to }
        : { type: 'moveTrough', from: c.cell, to },
    title: c.kind === 'portable' ? 'Move this portable trough here' : 'Move this trough here',
    confirm: 'Move it',
    edges: [],
    cells: [to],
    corner: null,
    style: 'ok',
  };
}
