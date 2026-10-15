import {
  NavLink,
} from 'react-router-dom'

const views = [
  {
    label: 'Planner',
    to: '/planner',
  },
  {
    label: 'Timeline',
    to: '/timeline',
  },
  {
    label: 'Focus',
    to: '/focus',
  },
  {
    label: 'Marks',
    to: '/marks',
  },
]

function getViewClassName({
  isActive,
}) {
  return [
    'flex h-[26px] w-[90px] items-center justify-center',
    'text-[15px] transition-colors',
    isActive
      ? 'bg-arc-blue text-arc-text'
      : 'text-arc-text hover:bg-arc-blue/30',
  ].join(' ')
}

export default function ViewToggle() {
  return (
    <nav
      aria-label="Planning view"
      className="
        flex h-[26px] w-[271px]
        overflow-hidden rounded-[28px]
        border border-[#4a496b]
        bg-arc-panel
      "
    >
      {views.map(
        ({
          label,
          to,
        }, index) => (
          <NavLink
            key={to}
            to={to}
            className={(state) =>
              [
                getViewClassName(state),
                index === 0
                  ? 'rounded-l-[28px]'
                  : index === views.length - 1
                    ? 'rounded-r-[28px]'
                    : '',
              ].join(' ')
            }
          >
            {label}
          </NavLink>
        ),
      )}
    </nav>
  )
}
