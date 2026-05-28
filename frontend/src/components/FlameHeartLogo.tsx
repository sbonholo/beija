export function FlameHeartLogo({ size = 88 }: { size?: number }) {
  const h = Math.round(size * 1.25);
  return (
    <svg width={size} height={h} viewBox="0 0 100 125" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="fhBlur" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
        <filter id="fhBlurSm" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2" />
        </filter>

        {/* Flame stroke: purple-left → pink → orange-right */}
        <linearGradient id="fhFlameGrad" x1="0%" y1="20%" x2="100%" y2="80%">
          <stop offset="0%"   stopColor="#9B20E8" />
          <stop offset="40%"  stopColor="#FF1CD6" />
          <stop offset="100%" stopColor="#FF6B00" />
        </linearGradient>

        {/* Heart stroke: magenta → fire-red */}
        <linearGradient id="fhHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#CC00AA" />
          <stop offset="100%" stopColor="#FF3B00" />
        </linearGradient>

        {/* Flame fill: deep maroon */}
        <linearGradient id="fhFill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#3A0028" />
          <stop offset="100%" stopColor="#1A0010" />
        </linearGradient>

        {/* Inner ember glow */}
        <radialGradient id="fhEmber" cx="50%" cy="68%" r="38%">
          <stop offset="0%"   stopColor="#8B0040" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#1A0010" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Flame ── */}
      {/* wide glow halo */}
      <path
        d="M50 112 C37 112 12 96 10 78 C8 63 16 48 27 39
           C19 29 21 14 31 8
           C35 19 37 29 41 33
           C39 21 41 10 50 4
           C59 10 61 21 59 33
           C63 29 65 19 69 8
           C79 14 81 29 73 39
           C84 48 92 63 90 78
           C88 96 63 112 50 112 Z"
        fill="none"
        stroke="url(#fhFlameGrad)"
        strokeWidth="8"
        strokeLinejoin="round"
        filter="url(#fhBlur)"
        opacity="0.85"
      />
      {/* dark fill */}
      <path
        d="M50 112 C37 112 12 96 10 78 C8 63 16 48 27 39
           C19 29 21 14 31 8
           C35 19 37 29 41 33
           C39 21 41 10 50 4
           C59 10 61 21 59 33
           C63 29 65 19 69 8
           C79 14 81 29 73 39
           C84 48 92 63 90 78
           C88 96 63 112 50 112 Z"
        fill="url(#fhFill)"
      />
      {/* inner ember radial */}
      <path
        d="M50 112 C37 112 12 96 10 78 C8 63 16 48 27 39
           C19 29 21 14 31 8
           C35 19 37 29 41 33
           C39 21 41 10 50 4
           C59 10 61 21 59 33
           C63 29 65 19 69 8
           C79 14 81 29 73 39
           C84 48 92 63 90 78
           C88 96 63 112 50 112 Z"
        fill="url(#fhEmber)"
      />
      {/* sharp neon outline */}
      <path
        d="M50 112 C37 112 12 96 10 78 C8 63 16 48 27 39
           C19 29 21 14 31 8
           C35 19 37 29 41 33
           C39 21 41 10 50 4
           C59 10 61 21 59 33
           C63 29 65 19 69 8
           C79 14 81 29 73 39
           C84 48 92 63 90 78
           C88 96 63 112 50 112 Z"
        fill="none"
        stroke="url(#fhFlameGrad)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ── Heart ── */}
      {/* heart glow */}
      <path
        d="M50 92 C47 88 26 77 26 63
           C26 54 32 47 40 47
           C44 47 48 50 50 54
           C52 50 56 47 60 47
           C68 47 74 54 74 63
           C74 77 53 88 50 92 Z"
        fill="none"
        stroke="url(#fhHeartGrad)"
        strokeWidth="4"
        filter="url(#fhBlurSm)"
        opacity="0.9"
      />
      {/* heart translucent fill */}
      <path
        d="M50 92 C47 88 26 77 26 63
           C26 54 32 47 40 47
           C44 47 48 50 50 54
           C52 50 56 47 60 47
           C68 47 74 54 74 63
           C74 77 53 88 50 92 Z"
        fill="rgba(140, 0, 55, 0.32)"
      />
      {/* heart sharp outline */}
      <path
        d="M50 92 C47 88 26 77 26 63
           C26 54 32 47 40 47
           C44 47 48 50 50 54
           C52 50 56 47 60 47
           C68 47 74 54 74 63
           C74 77 53 88 50 92 Z"
        fill="none"
        stroke="url(#fhHeartGrad)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* ── Sparks ── */}
      {/* cross-sparks around the logo */}
      {([
        [7, 30, '#FF1CD6', 1.4],   [93, 34, '#FF6B00', 1.2],
        [5, 70, '#9B20E8', 1.0],   [95, 66, '#FF1CD6', 1.1],
        [16, 14, '#FF6B00', 0.9],  [84, 18, '#FF1CD6', 0.9],
        [20, 98, '#9B20E8', 0.8],  [80, 96, '#FF6B00', 0.8],
      ] as [number, number, string, number][]).map(([cx, cy, color, r], i) => (
        <g key={i} transform={`translate(${cx},${cy})`}>
          <line x1={-r * 2} y1="0" x2={r * 2} y2="0" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="0" y1={-r * 2} x2="0" y2={r * 2} stroke={color} strokeWidth="1" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}
