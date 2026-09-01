// The output rail button and its icon set, extracted from ProgrammingTab
// (split step 2). Icons are drawn in the TAC palette, not shipped artwork.

export default function RailButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className="flex h-9 w-9 items-center justify-center rounded-lg transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:outline-none disabled:cursor-wait disabled:opacity-40"
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-1/2 left-full z-30 ml-2 -translate-y-1/2 rounded-md bg-ink-950 px-2 py-1 text-[12px] font-medium whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </div>
  );
}

/** Block overview: a stacked-pages document on the same dark tile. */
export function OverviewIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="6.2" y="4.8" width="10" height="13" rx="1.4" fill="#F5F3EB" />
      <rect x="8.2" y="6.8" width="10" height="13" rx="1.4" fill="#DEC5AE" />
      <path d="M10.5 10.4h5.4M10.5 13h5.4M10.5 15.6h3.4" stroke="#1B1B1B" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

/** TV output: a screen on a dark tile, matching the other two rail marks. */
export function TvIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.6" y="6.2" width="14.8" height="9.8" rx="1.8" fill="#F5F3EB" />
      <path d="M9 19h6" stroke="#F5F3EB" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 16v3" stroke="#F5F3EB" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Google Sheets' app mark: green grid tile on a dark rounded tile. */
export function SheetsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="tac-sheets-green" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#12A150" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.2" y="6.6" width="15.6" height="10.8" rx="2.4" fill="url(#tac-sheets-green)" />
      <path
        d="M13.6 6.6v10.8M4.2 12h15.6"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Floor layout: a room plan on a dark tile. */
export function LayoutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <rect x="4.5" y="5" width="15" height="3" rx="1" fill="#DEC5AE" />
      <rect x="4.5" y="10.5" width="6.5" height="3" rx="1" fill="#4E6353" />
      <rect x="13" y="10.5" width="6.5" height="3" rx="1" fill="#4E6353" />
      <rect x="4.5" y="16" width="15" height="3" rx="1" stroke="#8A8580" strokeWidth="1.2" fill="none" />
    </svg>
  );
}

/** TrainHeroic's app mark: lime slashed H on a dark rounded tile. Drawn to
 *  match rather than shipped as artwork, and used only to label the link to
 *  their product. */
export function TrainHeroicIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1.5" y="1.5" width="21" height="21" rx="5.5" fill="#1B1B1B" />
      <g fill="#C9F31D">
        <path d="M7.4 6.2h3.1v11.6H7.4z" />
        <path d="M13.5 6.2h3.1v11.6h-3.1z" />
        <path d="M10.5 12.9l3-3.2v3.4l-3 3.2z" />
      </g>
    </svg>
  );
}
