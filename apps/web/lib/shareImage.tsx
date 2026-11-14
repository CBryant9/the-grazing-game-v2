import { ImageResponse } from 'next/og';

/** The size every share image is made at. Social sites show it at about 1.9 to 1. */
export const SHARE_SIZE = { width: 1200, height: 630 } as const;

// Interface colours from the dark theme in globals.css.
const NAVY = '#070d19';
const PANEL = '#111a2e';
const CREAM = '#f3e7cf';
const CORAL = '#ef8478';
const MUTED = '#a9b3c9';

/** Paddock colours, the same ones the neutral labels use (Green, Mixed, Dry & rank, Short). */
const PADDOCKS = ['#4f7f2f', '#8a8a3c', '#a58a52', '#6f5a3a', '#5e9438', '#8a8a3c'];

/**
 * A share image drawn from code: the page's name over a strip of paddocks.
 * Used by each page's `opengraph-image.tsx`. It carries no game data.
 */
export function shareImage(args: { heading: string; line: string }): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: NAVY,
        color: CREAM,
        padding: 64,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            letterSpacing: 6,
            color: CORAL,
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          The Grazing Game
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 22,
            fontSize: args.heading.length > 22 ? 84 : 110,
            lineHeight: 1,
            fontWeight: 800,
            textTransform: 'uppercase',
          }}
        >
          {args.heading}
        </div>
        <div style={{ display: 'flex', marginTop: 26, fontSize: 36, color: MUTED, maxWidth: 980 }}>
          {args.line}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          height: 150,
          borderRadius: 14,
          overflow: 'hidden',
          border: `6px solid ${PANEL}`,
        }}
      >
        {PADDOCKS.map((colour, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flex: 1,
              background: colour,
              borderRight: i < PADDOCKS.length - 1 ? '6px solid #d6d0c0' : 'none',
              alignItems: 'flex-end',
              padding: 14,
              gap: 10,
            }}
          >
            {i % 2 === 0 ? (
              <>
                <div style={{ display: 'flex', width: 26, height: 14, background: '#2c2624' }} />
                <div style={{ display: 'flex', width: 26, height: 14, background: '#9a4a2a' }} />
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>,
    { ...SHARE_SIZE },
  );
}
