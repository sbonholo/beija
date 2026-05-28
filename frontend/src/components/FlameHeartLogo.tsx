const HEART =
  'M50 86 C45 80 14 62 14 40' +
  ' C14 26 24 16 36 16' +
  ' C42 16 47 19 50 24' +
  ' C53 19 58 16 64 16' +
  ' C76 16 86 26 86 40' +
  ' C86 62 55 80 50 86 Z';

const SPARKS: [number, number, string, number][] = [
  [44,  1, '#FF3B9A', 1.4],
  [58,  3, '#FF6E3E', 1.3],
  [8,  60, '#E11D74', 1.1],
  [92, 56, '#FF3B9A', 1.0],
  [16, 26, '#FF6E3E', 0.9],
  [84, 22, '#FF3B9A', 0.9],
  [28, 96, '#E11D74', 0.8],
  [72, 96, '#FF6E3E', 0.8],
];

export function FlameHeartLogo({ size = 88 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <filter id="fhBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
        <filter id="fhBlurSm" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <linearGradient id="fhHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#FF3B9A" />
          <stop offset="100%" stopColor="#FF6E3E" />
        </linearGradient>
        <radialGradient id="fhHeartFill" cx="50%" cy="55%" r="55%">
          <stop offset="0%"   stopColor="#FF3B9A" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#5A0030" stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* outer glow */}
      <path d={HEART} fill="none" stroke="url(#fhHeartGrad)"
        strokeWidth="9" filter="url(#fhBlur)" opacity="0.85" />
      {/* translucent fill */}
      <path d={HEART} fill="url(#fhHeartFill)" />
      {/* mid glow */}
      <path d={HEART} fill="none" stroke="url(#fhHeartGrad)"
        strokeWidth="4" filter="url(#fhBlurSm)" opacity="0.95" />
      {/* sharp outline */}
      <path d={HEART} fill="none" stroke="url(#fhHeartGrad)"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* ember sparks */}
      {SPARKS.map(([cx, cy, color, r], i) => (
        <g key={i} transform={`translate(${cx},${cy})`}>
          <line x1={-r * 2} y1="0" x2={r * 2} y2="0" stroke={color} strokeWidth="1" opacity="0.7" />
          <line x1="0" y1={-r * 2} x2="0" y2={r * 2} stroke={color} strokeWidth="1" opacity="0.7" />
        </g>
      ))}
    </svg>
  );
}
