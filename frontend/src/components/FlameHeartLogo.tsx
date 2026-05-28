// Single-tip flame path: wide rounded base, organic sides, one pointed tip at top
const FLAME =
  'M50 112 C34 112 12 96 10 78' +
  ' C8 62 14 48 24 40' +
  ' C16 32 18 20 28 12' +
  ' C36 6 46 4 50 4' +
  ' C54 4 64 6 72 12' +
  ' C82 20 84 32 76 40' +
  ' C86 48 92 62 90 78' +
  ' C88 96 66 112 50 112 Z';

// Inner flame lick — slightly smaller, adds depth and warmth
const INNER_FLAME =
  'M50 108 C40 108 22 96 20 81' +
  ' C18 68 24 56 34 48' +
  ' C26 42 28 30 36 22' +
  ' C42 14 48 10 50 10' +
  ' C52 10 58 14 64 22' +
  ' C72 30 74 42 66 48' +
  ' C76 56 82 68 80 81' +
  ' C78 96 60 108 50 108 Z';

const HEART =
  'M50 90 C47 86 28 75 28 62' +
  ' C28 53 34 47 42 47' +
  ' C46 47 49 50 50 54' +
  ' C51 50 54 47 58 47' +
  ' C66 47 72 53 72 62' +
  ' C72 75 53 86 50 90 Z';

const SPARKS: [number, number, string, number][] = [
  [44,  1, '#FF1CD6', 1.4],
  [58,  3, '#FF6B00', 1.3],
  [8,  60, '#9B20E8', 1.1],
  [92, 56, '#FF1CD6', 1.0],
  [16, 26, '#FF6B00', 0.9],
  [84, 22, '#FF1CD6', 0.9],
  [28, 112, '#9B20E8', 0.8],
  [72, 112, '#FF6B00', 0.8],
];

export function FlameHeartLogo({ size = 88 }: { size?: number }) {
  const h = Math.round(size * 1.25);
  return (
    <svg width={size} height={h} viewBox="0 0 100 125" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="fhBlur" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="fhBlurSm" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <filter id="fhBlurTiny" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>

        {/* Flame gradient: purple top → magenta mid → orange base */}
        <linearGradient id="fhFlameGrad" x1="30%" y1="0%" x2="70%" y2="100%">
          <stop offset="0%"   stopColor="#9B20E8" />
          <stop offset="45%"  stopColor="#FF1CD6" />
          <stop offset="100%" stopColor="#FF6B00" />
        </linearGradient>

        {/* Heart gradient: hot pink → fire red */}
        <linearGradient id="fhHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#FF1CD6" />
          <stop offset="100%" stopColor="#FF3B00" />
        </linearGradient>

        {/* Flame body fill: deep near-black maroon */}
        <linearGradient id="fhFill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#2A001E" />
          <stop offset="100%" stopColor="#10000A" />
        </linearGradient>

        {/* Inner lick fill: slightly lighter */}
        <linearGradient id="fhInnerFill" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%"   stopColor="#4A0034" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#200018" stopOpacity="0.4" />
        </linearGradient>

        {/* Radial ember glow at the base */}
        <radialGradient id="fhEmber" cx="50%" cy="72%" r="44%">
          <stop offset="0%"   stopColor="#CC0055" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#10000A"  stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* ── Outer glow halo ── */}
      <path d={FLAME} fill="none" stroke="url(#fhFlameGrad)"
        strokeWidth="10" strokeLinejoin="round"
        filter="url(#fhBlur)" opacity="0.65" />

      {/* ── Flame body ── */}
      <path d={FLAME} fill="url(#fhFill)" />
      <path d={FLAME} fill="url(#fhEmber)" />

      {/* ── Inner flame lick ── */}
      <path d={INNER_FLAME} fill="url(#fhInnerFill)" />
      <path d={INNER_FLAME} fill="none" stroke="url(#fhFlameGrad)"
        strokeWidth="1" strokeLinejoin="round"
        opacity="0.45" filter="url(#fhBlurTiny)" />

      {/* ── Sharp neon outline ── */}
      <path d={FLAME} fill="none" stroke="url(#fhFlameGrad)"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* ── Heart ── */}
      {/* glow */}
      <path d={HEART} fill="none" stroke="url(#fhHeartGrad)"
        strokeWidth="5" filter="url(#fhBlurSm)" opacity="0.9" />
      {/* translucent fill */}
      <path d={HEART} fill="rgba(180, 0, 65, 0.35)" />
      {/* sharp outline */}
      <path d={HEART} fill="none" stroke="url(#fhHeartGrad)"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />

      {/* ── Ember sparks ── */}
      {SPARKS.map(([cx, cy, color, r], i) => (
        <g key={i} transform={`translate(${cx},${cy})`}>
          <line x1={-r * 2} y1="0" x2={r * 2} y2="0" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="0" y1={-r * 2} x2="0" y2={r * 2} stroke={color} strokeWidth="1" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}
