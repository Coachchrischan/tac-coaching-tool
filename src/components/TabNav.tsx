import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/schedule', label: 'Schedule' },
  { to: '/programming', label: 'Programming' },
  { to: '/movement', label: 'Movement Check' },
  { to: '/community', label: 'Community' },
  { to: '/planning', label: 'Planning' },
  { to: '/layouts', label: 'Layouts' },
  { to: '/equipment', label: 'Equipment' },
];

export default function TabNav() {
  return (
    <header className="border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-[1440px] items-center gap-8 px-6">
        <div className="py-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink-950">
            Teneriffe Athletic Club
          </span>
          <span className="ml-2 text-[13px] font-medium tracking-wide text-ink-400 uppercase">
            Coaching
          </span>
        </div>
        <nav className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `whitespace-nowrap border-b-2 px-3 py-4 text-sm font-medium transition-colors ${
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
