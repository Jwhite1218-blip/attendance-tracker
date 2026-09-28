import './AllStarBanner.css'
import confetti from '../assets/allstars/confetti.jpg'
import goldStar from '../assets/allstars/star-3d.png'
import ribbon from '../assets/allstars/ribbon.png'
import warrenSeal from '../assets/allstars/warren-seal.png'
import aramarkWhite from '../assets/allstars/aramark-white.png'
import { ALL_STAR_REASON_OPTIONS } from '../data/recognitionStore.js'

// Liz's printed banner, rebuilt rather than dropped in as a flat image so the
// stars can pin to it. Every mark here is lifted from her own artwork: the
// confetti field, the gold star, the blank ribbon, the Warren Township seal
// and the Aramark mark.
//
// The six ribbons are driven from ALL_STAR_REASON_OPTIONS rather than a list
// of their own, so the banner can never advertise a reason the entry form does
// not offer. "Other" is a catch-all on the form and was never on the printed
// banner, so it is left off here too.
const RIBBON_CATEGORIES = ALL_STAR_REASON_OPTIONS.filter(reason => reason !== 'Other')

const STAR_GLYPH = 'M12 2.3l2.9 6.26 6.85.79-5.08 4.64 1.38 6.74L12 17.4l-6.05 3.33 1.38-6.74L2.25 9.35l6.85-.79z'

function Ribbon({ label }) {
  return (
    <div className="allstar-banner__ribbon" style={{ backgroundImage: `url(${ribbon})` }}>
      <span className="all-star-label">{label}</span>
    </div>
  )
}

export default function AllStarBanner({
  starCount = 0,
  countLabel = 'stars this month',
  pinned = [],
  emptyNote = 'No stars pinned yet this month.',
}) {
  const half = Math.ceil(RIBBON_CATEGORIES.length / 2)

  return (
    <section
      className="allstar-banner print:break-inside-avoid"
      style={{ backgroundImage: `url(${confetti})` }}
      aria-label="Warren Student Nutrition All-Stars"
    >
      <div className="allstar-banner__inner">
        <div className="allstar-banner__ribbons allstar-banner__ribbons--left">
          {RIBBON_CATEGORIES.slice(0, half).map(label => <Ribbon key={label} label={label} />)}
        </div>

        <div className="allstar-banner__core">
          <p className="allstar-banner__eyebrow all-star-display">Warren Student Nutrition</p>
          <p className="allstar-banner__wordmark all-star-script">All-Stars</p>

          <div className="allstar-banner__starwrap">
            <img className="allstar-banner__star" src={goldStar} alt="" />
            <div className="allstar-banner__count">
              <b className="all-star-display">{starCount}</b>
              <span className="all-star-label">{countLabel}</span>
            </div>
          </div>

          <p className="allstar-banner__tagline all-star-script">Catch Someone Shining Every Day!</p>
        </div>

        <div className="allstar-banner__ribbons allstar-banner__ribbons--right">
          {RIBBON_CATEGORIES.slice(half).map(label => <Ribbon key={label} label={label} />)}
        </div>

        <img className="allstar-banner__mark allstar-banner__mark--aramark" src={aramarkWhite} alt="Aramark Student Nutrition" />
        <img className="allstar-banner__mark allstar-banner__mark--seal" src={warrenSeal} alt="Warren Township Child Nutrition" />
      </div>

      <div className="allstar-board">
        {pinned.length ? pinned.map(entry => (
          <span key={entry.id} className="allstar-board__pin">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={STAR_GLYPH} /></svg>
            {entry.name}
            {entry.count > 1 && <em>×{entry.count}</em>}
          </span>
        )) : (
          <span className="allstar-board__empty">{emptyNote}</span>
        )}
      </div>
    </section>
  )
}
