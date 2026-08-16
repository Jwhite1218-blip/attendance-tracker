import { STATUS_OPTIONS } from '../data/schools.js'

const STATUS_CLASSES = {
  present: 'bg-present-bg text-present-text border-present-border',
  absent:  'bg-absent-bg text-absent-text border-absent-border',
  late:    'bg-late-bg text-late-text border-late-border',
  excused: 'bg-excused-bg text-excused-text border-excused-border',
  remote:  'bg-remote-bg text-remote-text border-remote-border',
}

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map(s => [s.value, s.label]))

export default function StatusBadge({ status, small = false }) {
  const classes = STATUS_CLASSES[status] || 'bg-gray-100 text-gray-500 border-gray-200'
  const label = STATUS_LABELS[status] || status

  if (small) {
    return (
      <span className={`inline-flex items-center rounded border ${classes} px-1.5 py-0.5 text-xs font-medium`}>
        {label}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center justify-center rounded-md border ${classes} ${small ? 'px-1.5 py-0.5 text-xs' : 'px-3 py-1.5 text-xs font-medium'} w-full`}>
      {label}
    </span>
  )
}
