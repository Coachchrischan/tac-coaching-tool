import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

// The daily loop keeps top billing; the reference layer lives behind Club.
// Eleven peer tabs was a mid-size SaaS IA on a one-coach tool (2026-09-01
// roundtable, all four brains): nothing is removed, only demoted, so every
// route still works and this is reversible by moving an entry back.
const PRIMARY = [
  { to: '/', label: 'Home' },
  { to: '/annual', label: 'Annual Plan' },
  { to: '/programming', label: 'Programming' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/layouts', label: 'Layouts' },
  { to: '/planning', label: 'Planning' },
];

const CLUB = [
  { to: '/movement', label: 'Movement Check' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/equipment', label: 'Equipment' },
  { to: '/community', label: 'Community' },
  { to: '/ethos', label: 'Ethos' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap border-b-2 px-2.5 py-3.5 text-[13px] font-medium transition-colors ${
    isActive
      ? 'border-accent-600 text-ink-950'
      : 'border-transparent text-ink-500 hover:text-ink-950'
  }`;

export default function TabNav() {
  const [clubOpen, setClubOpen] = useState(false);
  const { pathname } = useLocation();
  const clubActive = CLUB.some((t) => t.to === pathname);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setClubOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!clubOpen) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setClubOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [clubOpen]);

  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 px-6">
        <div className="py-3.5">
          <span className="font-display text-[16px] tracking-tight text-ink-950">
            Teneriffe Athletic Club
          </span>
          <span className="ml-2 text-[11px] font-semibold tracking-[0.18em] text-accent-600 uppercase">
            Coaching
          </span>
        </div>
        <nav className="flex flex-1 flex-wrap gap-x-0.5">
          {PRIMARY.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={linkClass}>
              {tab.label}
            </NavLink>
          ))}
          <div className="relative" ref={ref}>
            <button
              type="button"
              onClick={() => setClubOpen((o) => !o)}
              className={`whitespace-nowrap border-b-2 px-2.5 py-3.5 text-[13px] font-medium transition-colors ${
                clubActive
                  ? 'border-accent-600 text-ink-950'
                  : 'border-transparent text-ink-500 hover:text-ink-950'
              }`}
            >
              Club {clubOpen ? '▴' : '▾'}
            </button>
            {clubOpen && (
              <div className="absolute left-0 z-30 mt-0.5 min-w-44 rounded-lg border border-ink-200 bg-white py-1 shadow-lg">
                {CLUB.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      `block px-3.5 py-2 text-[13px] font-medium ${
                        isActive ? 'text-accent-600' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-950'
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
