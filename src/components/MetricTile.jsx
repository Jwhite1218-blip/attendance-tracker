// One number on a dashboard, with a way into the detail behind it.
//
// Liz, 2026-10-26: "trying to simplify the build of both so they aren't too
// different beyond access to buildings." This markup existed three times —
// the district dashboard's top row, its recognition row, and the school
// overview on a manager's page — and had already drifted: two of them used
// p-5 and one p-4, two mt-4 and one mt-3. Nobody chose that.
//
// Three modes, because a dashboard tile does one of three things: expand,
// go somewhere, or just state a number.
import { Link } from 'react-router-dom'

const SHELL = 'rounded-xl border bg-white p-5 text-left transition-all hover:border-brand-300 hover:shadow-md'

function Body({ label, description, count, footer }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800">{label}</p>
          {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
        </div>
        <span className="inline-flex min-w-9 h-9 flex-none items-center justify-center rounded-lg bg-brand-50 text-brand-700 text-lg font-bold">
          {count}
        </span>
      </div>
      {footer && <p className="text-xs font-semibold text-brand-600 mt-4">{footer}</p>}
    </>
  )
}

export default function MetricTile({
  label,
  description,
  count,
  // Expanding tile: give it both, and the caller owns which one is open.
  expanded,
  onToggle,
  controls,
  // Link tile: a way in rather than a drill-down.
  to,
  linkLabel = 'Open',
}) {
  if (to) {
    return (
      <Link to={to} className={`${SHELL} border-gray-200 block`}>
        <Body label={label} description={description} count={count} footer={linkLabel} />
      </Link>
    )
  }

  if (!onToggle) {
    return (
      <div className={`${SHELL} border-gray-200`}>
        <Body label={label} description={description} count={count} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      className={`${SHELL} ${expanded ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'}`}
    >
      <Body
        label={label}
        description={description}
        count={count}
        footer={expanded ? 'Hide details' : 'View details'}
      />
    </button>
  )
}
