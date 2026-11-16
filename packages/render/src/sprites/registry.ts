/**
 * The sprite registry: every picture the map stamps down, by name.
 *
 * For now each sprite is drawn in code. Each one can be swapped for
 * exported art later, one at a time, with `replace`, and the map code does
 * not change: it only ever asks for a sprite by its name.
 *
 * All the sprites are packed into one sheet when the map starts, so the
 * map draws them in a few batches.
 */

export interface SpriteDef {
  /** Size of the picture, in texture pixels. */
  w: number;
  h: number;
  /** The point of the picture that sits on its spot on the ground, 0 to 1 across and down. */
  ax: number;
  ay: number;
  /** Texture pixels for one square across. The map scales the sprite by this. */
  ppu: number;
  /** Draws the sprite, once, onto a canvas of its size. */
  paint?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  /** Exported art to use in place of drawing it. */
  image?: CanvasImageSource;
}

export class SpriteRegistry {
  private readonly defs = new Map<string, SpriteDef>();

  set(id: string, def: SpriteDef): this {
    this.defs.set(id, def);
    return this;
  }

  get(id: string): SpriteDef | undefined {
    return this.defs.get(id);
  }

  has(id: string): boolean {
    return this.defs.has(id);
  }

  ids(): string[] {
    return [...this.defs.keys()];
  }

  /**
   * Swap one sprite for exported art. Size, anchor and scale stay as they
   * were unless given, so art drawn to the same size drops straight in.
   */
  replace(
    id: string,
    image: CanvasImageSource,
    change: Partial<Pick<SpriteDef, 'w' | 'h' | 'ax' | 'ay' | 'ppu'>> = {},
  ): this {
    const was = this.defs.get(id);
    if (!was) throw new Error(`No sprite is called "${id}".`);
    this.defs.set(id, { ...was, ...change, paint: undefined, image });
    return this;
  }

  /** A separate copy, so one map's swaps do not reach another's. */
  clone(): SpriteRegistry {
    const copy = new SpriteRegistry();
    for (const [id, def] of this.defs) copy.set(id, { ...def });
    return copy;
  }
}

export interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AtlasLayout {
  width: number;
  height: number;
  frames: Map<string, AtlasFrame>;
}

/**
 * Lay sprites out on one sheet, in rows, tallest first. `pad` pixels are
 * left round each one so neighbours never bleed into each other.
 */
export function packAtlas(
  sprites: readonly { id: string; w: number; h: number }[],
  maxWidth = 2048,
  pad = 3,
): AtlasLayout {
  const order = [...sprites].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
  const frames = new Map<string, AtlasFrame>();
  let x = pad;
  let y = pad;
  let rowH = 0;
  let width = 0;
  for (const s of order) {
    if (s.w + pad * 2 > maxWidth) throw new Error(`Sprite "${s.id}" is wider than the sheet.`);
    if (x + s.w + pad > maxWidth) {
      x = pad;
      y += rowH + pad;
      rowH = 0;
    }
    frames.set(s.id, { x, y, w: s.w, h: s.h });
    x += s.w + pad;
    rowH = Math.max(rowH, s.h);
    width = Math.max(width, x);
  }
  return { width, height: y + rowH + pad, frames };
}
