/**
 * لوحة افتتاحية «عن غصن» (D-161): هدايا مرسومة على طاولة بألوان الهوية (صندوق، عطر، باقة، بطاقة) — مؤقتة حتى
 * تُعتمد صورة حقيقية من المحل. بلا نصوص داخل الرسم.
 */
export function AboutArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 600 560" preserveAspectRatio="xMidYMid slice" aria-hidden className={className}>
      <rect width="600" height="560" fill="#EADFCB" />
      <circle cx="470" cy="120" r="110" fill="#F5F1E8" opacity=".7" />
      <rect y="400" width="600" height="160" fill="#C9AE86" />
      <rect y="400" width="600" height="6" fill="#B08D57" opacity=".6" />
      <rect x="70" y="270" width="190" height="150" rx="10" fill="#2F3B2C" />
      <rect x="58" y="240" width="214" height="44" rx="10" fill="#3A4836" />
      <rect x="152" y="240" width="26" height="180" fill="#B08D57" />
      <path d="M165 240c-50-60-92-12-62 6 22 12 62-6 62-6zm0 0c50-60 92-12 62 6-22 12-62-6-62-6z" fill="#B08D57" />
      <rect x="318" y="210" width="44" height="34" rx="6" fill="#B08D57" />
      <rect x="326" y="244" width="28" height="18" fill="#8C7446" />
      <rect x="292" y="262" width="96" height="160" rx="22" fill="#D9C3A0" />
      <rect x="304" y="276" width="18" height="130" rx="9" fill="#FFFFFF" opacity=".45" />
      <rect x="314" y="330" width="52" height="34" rx="5" fill="#FFFFFF" opacity=".7" />
      <path d="M420 330l40 100 40-100z" fill="#D1B790" />
      <circle cx="440" cy="300" r="26" fill="#C26B6B" />
      <circle cx="480" cy="296" r="24" fill="#D78A83" />
      <circle cx="460" cy="270" r="22" fill="#B95A5E" />
      <circle cx="500" cy="322" r="18" fill="#7D8A6E" />
      <circle cx="418" cy="326" r="16" fill="#7D8A6E" />
      <g transform="rotate(-8 230 470)">
        <rect x="170" y="440" width="140" height="80" rx="6" fill="#FBF8F2" />
        <path d="M190 470h90M190 488h70" stroke="#B08D57" strokeWidth="3" strokeLinecap="round" />
      </g>
    </svg>
  );
}
