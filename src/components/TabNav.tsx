import { NavLink } from 'react-router-dom';

// Ordered by the coaching workflow, widest scope to narrowest, then the
// reference tabs: dashboard → plan the year → plan the training → check it
// → run the floor → the club layer.
const TABS = [
  { to: '/', label: 'Home' },
  { to: '/annual', label: 'Annual Plan' },
  { to: '/programming', label: 'Programming' },
  { to: '/movement', label: 'Movement Check' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/attendance', label: 'Attendance' },
  { to: '/layouts', label: 'Layouts' },
  { to: '/equipment', label: 'Equipment' },
  { to: '/community', label: 'Community' },
  { to: '/planning', label: 'Planning' },
  { to: '/ethos', label: 'Ethos' },
];

export default function TabNav() {
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
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === '/'}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-2.5 py-3.5 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'border-accent-600 text-ink-950'
                    : 'border-transparent text-ink-500 hover:text-ink-950'
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}
