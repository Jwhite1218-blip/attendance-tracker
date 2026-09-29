// The strip across the very top of every page.
//
// One job: make it obvious this is not finished. Nothing about cost, payment
// or licensing — the app sits in front of district staff all day, and a note
// about money on every screen reads as a demand whatever the wording. The
// point is only that nobody mistakes a work in progress for the finished
// thing.
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
          Demo only · still in development
        </span>
        <span className="ml-2 text-[#e8c65c]/70 sm:hidden">
          Demo only
        </span>
      </p>
    </div>
  )
}
