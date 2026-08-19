import { CODE_MAP } from '../data/attendanceCodes.js'

export function StatusBadge({ code, size = 'normal' }) {
  const info = CODE_MAP[code]
  if (!info) return null

  const cls = info.hex
  const label = info.shortLabel

  const sizeClasses = size === 'small'
    ? 'text-[10px] px-1 py-0.5 min-w-[24px]'
    : size === 'tiny'
    ? 'text-[9px] px-0.5 py-0.5 min-w-[18px]'
    : 'text-xs px-2 py-1 min-w-[36px]'

  return (
    <span
      className={`inline-flex items-center justify-center rounded font-semibold border ${sizeClasses}`}
      style={{
        backgroundColor: cls.bg,
        color: cls.text,
        borderColor: cls.border,
      }}
      title={info.label}
    >
      {label}
    </span>
  )
}

export function StatusBadgeLarge({ code }) {
  const info = CODE_MAP[code]
  if (!info) return null

  const cls = info.hex

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: cls.bg,
        color: cls.text,
        borderColor: cls.border,
      }}
    >
      <span className="font-bold">{info.shortLabel}</span>
      <span>{info.label}</span>
    </span>
  )
}
