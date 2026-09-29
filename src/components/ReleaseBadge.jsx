// The strip across the very top of every page.
//
// Two things need saying and neither is decoration: this is pre-release
// software, and Warren is using it at no cost with no licence in place. Both
// are easy to forget once a thing looks finished and people rely on it daily,
// which is exactly when the misunderstanding gets expensive.
//
// The version comes from package.json through __APP_VERSION__, so bumping it
// is one edit in one place. The build id sits in the tooltip — when somebody
// reports a problem, "which build were you on" is the first question.
export default function ReleaseBadge() {
  return (
    <div
      // Hidden when printing: an attendance record or an HR ledger going into
      // a personnel file should not carry a product banner across the top.
      className="print:hidden border-b border-[#d7b44b]/40 bg-[#14120e] px-3 py-1 text-center"
      title={`Build ${__BUILD_ID__}`}
    >
      <p className="text-[10px] font-semibold leading-tight tracking-wide text-[#e8c65c]/90">
        <span className="rounded bg-[#e8c65c] px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[#14120e]">
          Beta {__APP_VERSION__}
        </span>
        <span className="ml-2 hidden text-[#e8c65c]/70 sm:inline">
          Pre-release · provided at no cost by Localis Collective
        </span>
        <span className="ml-2 text-[#e8c65c]/70 sm:hidden">
          Pre-release · no-cost pilot
        </span>
      </p>
    </div>
  )
}
