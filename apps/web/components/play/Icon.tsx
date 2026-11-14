/** Small line icons for the navigation. They are decoration: every button carries its own words. */
const PATHS = {
  farm: 'M3 11 12 4l9 7M6 10v10h12V10M10 20v-6h4v6',
  market: 'M4 7h16l-1.5 5H5.5L4 7ZM6 12v8h12v-8M9 20v-5h6v5',
  herd: 'M5 8 3 5m16 3 2-3M7 8h10v6a5 5 0 0 1-10 0V8ZM10 14h.01M14 14h.01M10 17h4',
  paddocks: 'M4 4h16v16H4V4Zm0 8h16M12 4v16',
  plans: 'M5 5a2 2 0 1 0 0 .01M19 19a2 2 0 1 0 0 .01M7 5h7a4 4 0 0 1 0 8H10a4 4 0 0 0 0 8h7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6 6 18',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M6 9l6 6 6-6',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
