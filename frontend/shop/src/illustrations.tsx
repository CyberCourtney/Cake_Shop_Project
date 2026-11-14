// Drawn stand-ins for product photos. The baker's own photos will replace these (open question
// Q21). Placeholder photos found online are not used on the site: their licences are unknown.

export function CakeIllustration({ kind, iced }: { kind: "round-cake" | "rose"; iced?: boolean }) {
  return kind === "rose" ? <Rose /> : <RoundCake iced={iced ?? true} />;
}

function RoundCake({ iced }: { iced: boolean }) {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-label={iced ? "Illustration of an iced fruit cake" : "Illustration of a dark fruit cake"} className="illus">
      <ellipse cx="120" cy="178" rx="96" ry="12" fill="#000" opacity="0.08" />
      <path d="M28 170h184" stroke="#b8902f" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="120" cy="168" rx="90" ry="10" fill="#e9e3d8" />
      {/* cake body */}
      <path d="M44 92v66c0 8 34 14 76 14s76-6 76-14V92z" fill={iced ? "#fbf8f3" : "#3b1d14"} />
      <ellipse cx="120" cy="92" rx="76" ry="18" fill={iced ? "#ffffff" : "#4a271b"} />
      {iced ? (
        <>
          <path d="M44 94c6 14 10 14 14 2 4 18 10 18 14 4 4 14 10 14 14 2 4 16 10 16 14 4 4 14 10 14 14 2 4 16 10 16 14 4 4 14 10 14 14 2 4 12 8 12 12 2" fill="#fff" stroke="#eee6da" strokeWidth="1.5" />
          <path d="M44 150c0 8 34 14 76 14s76-6 76-14" stroke="#9e1b22" strokeWidth="9" fill="none" />
          <path d="M112 151l8 8 8-8-8-6z" fill="#c62828" />
          <circle cx="98" cy="84" r="7" fill="#c62828" />
          <circle cx="111" cy="80" r="6" fill="#9e1b22" />
          <path d="M120 82c10-14 28-12 34-4-12 0-22 2-34 4z" fill="#2f5d3a" />
          <path d="M120 82c-4-12 4-22 14-24-2 10-6 16-14 24z" fill="#3e7a4d" />
        </>
      ) : (
        <>
          {[60, 84, 112, 140, 168, 70, 98, 126, 154, 182].map((x, i) => (
            <circle key={i} cx={x} cy={i < 5 ? 120 : 146} r="3.5" fill="#7a2f1f" opacity="0.8" />
          ))}
          <ellipse cx="120" cy="92" rx="60" ry="11" fill="#5a3022" />
          <circle cx="104" cy="90" r="4" fill="#8f3a24" />
          <circle cx="130" cy="94" r="3" fill="#8f3a24" />
          <circle cx="144" cy="88" r="3.5" fill="#8f3a24" />
        </>
      )}
    </svg>
  );
}

function Rose() {
  return (
    <svg viewBox="0 0 240 200" role="img" aria-label="Illustration of rose-shaped mini cakes" className="illus">
      <ellipse cx="120" cy="178" rx="96" ry="12" fill="#000" opacity="0.08" />
      <path d="M28 170h184" stroke="#b8902f" strokeWidth="3" strokeLinecap="round" />
      {[
        { x: 78, s: 0.8 },
        { x: 162, s: 0.8 },
        { x: 120, s: 1 },
      ].map(({ x, s }, i) => (
        <g key={i} transform={`translate(${x} 128) scale(${s})`}>
          <ellipse cx="0" cy="40" rx="46" ry="8" fill="#e9e3d8" />
          <path d="M-40 10c0 22 18 32 40 32s40-10 40-32c-8 6-18 8-24 2 4-12-4-24-16-24s-20 12-16 24c-6 6-16 4-24-2z" fill="#3b1d14" />
          <path d="M-22 8c4-20 40-20 44 0-10-8-34-8-44 0z" fill="#5a3022" />
          <path d="M-12 4c2-14 22-14 24 0-6-6-18-6-24 0z" fill="#6d3a28" />
          <path d="M-4 0c0-8 8-8 8 0-2-3-6-3-8 0z" fill="#8f4a33" />
          <path d="M-36 14c8 12 22 14 36 14s28-2 36-14" stroke="#2a140e" strokeWidth="2" fill="none" />
        </g>
      ))}
    </svg>
  );
}
