import type { Shape } from "./catalog";

/**
 * صور توضيحية مرسومة (D-151): شكل المنتج بألوانه على خلفية بيضاء — مثل صورة مرفوعة بعد إزالة
 * الخلفية. «fullBleed» تُرسم على طاولة بخلفية حقيقية. بلا نصوص (لا خطوط داخل SVG).
 */
const S = 1200;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const c = (n >> shift) & 255;
    const v = amount < 0 ? c * (1 + amount) : c + (255 - c) * amount;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}

function rose(cx: number, cy: number, r: number, c: string): string {
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c}"/>
    <circle cx="${cx - r * 0.15}" cy="${cy - r * 0.1}" r="${r * 0.62}" fill="${shade(c, -0.18)}"/>
    <path d="M${cx - r * 0.35} ${cy} q${r * 0.35} ${-r * 0.5} ${r * 0.7} 0" stroke="${shade(c, 0.25)}" stroke-width="${r * 0.12}" fill="none" stroke-linecap="round"/>`;
}

function drawing(shape: Shape, main: string, accent: string): string {
  const dark = shade(main, -0.25);
  const light = shade(main, 0.35);
  switch (shape) {
    case "bouquet": {
      const heads = [
        [600, 380, 95],
        [470, 450, 85],
        [730, 450, 85],
        [540, 300, 75],
        [665, 300, 75],
        [600, 500, 80],
        [420, 340, 60],
        [780, 340, 60],
      ]
        .map(([x, y, r]) => rose(x!, y!, r!, main))
        .join("");
      return `<path d="M520 560 L600 1000 L680 560 Z" fill="${accent}"/>
        <path d="M600 560 L540 980 M600 560 L660 980" stroke="${shade(accent, -0.3)}" stroke-width="10"/>
        <path d="M380 520 L600 1010 L820 520 Q600 600 380 520 Z" fill="${shade("#D1B790", 0.2)}" stroke="#B08D57" stroke-width="6"/>
        ${heads}
        <path d="M540 760 q60 40 120 0 q-20 60 -60 60 q-40 0 -60 -60z" fill="${accent}"/>`;
    }
    case "box-flowers": {
      const heads = [
        [470, 470],
        [600, 440],
        [730, 470],
        [535, 380],
        [665, 380],
        [600, 330],
      ]
        .map(([x, y]) => rose(x!, y!, 78, main))
        .join("");
      return `<ellipse cx="600" cy="520" rx="300" ry="70" fill="${shade(accent, -0.2)}"/>
        <rect x="300" y="520" width="600" height="420" fill="${accent}"/>
        <ellipse cx="600" cy="940" rx="300" ry="70" fill="${shade(accent, -0.1)}"/>
        ${heads}
        <rect x="300" y="640" width="600" height="40" fill="#B08D57"/>`;
    }
    case "perfume":
      return `<rect x="545" y="230" width="110" height="90" rx="14" fill="${accent}"/>
        <rect x="570" y="320" width="60" height="50" fill="${shade(accent, -0.2)}"/>
        <rect x="390" y="370" width="420" height="560" rx="70" fill="${main}"/>
        <rect x="420" y="400" width="80" height="480" rx="40" fill="${light}" opacity=".55"/>
        <rect x="480" y="580" width="240" height="160" rx="16" fill="#FFFFFF" opacity=".6"/>
        <rect x="520" y="640" width="160" height="14" rx="7" fill="${accent}"/>`;
    case "perfume-tall":
      return `<circle cx="600" cy="230" r="70" fill="${accent}"/>
        <rect x="575" y="290" width="50" height="70" fill="${shade(accent, -0.2)}"/>
        <path d="M470 360 H730 L780 960 H420 Z" fill="${main}"/>
        <path d="M500 380 H560 L530 940 H460 Z" fill="${light}" opacity=".5"/>
        <rect x="510" y="600" width="180" height="120" rx="12" fill="#FFFFFF" opacity=".6"/>`;
    case "bottle":
      return `<rect x="555" y="200" width="90" height="110" rx="16" fill="${accent}"/>
        <path d="M520 330 q80 -40 160 0 v560 q0 50 -50 50 h-60 q-50 0 -50 -50z" fill="${main}"/>
        <rect x="535" y="360" width="34" height="520" rx="17" fill="${light}" opacity=".55"/>
        <rect x="545" y="560" width="110" height="170" rx="12" fill="#FFFFFF" opacity=".6"/>`;
    case "jar":
      return `<rect x="380" y="380" width="440" height="110" rx="24" fill="${accent}"/>
        <rect x="400" y="480" width="400" height="420" rx="60" fill="${main}"/>
        <rect x="430" y="510" width="60" height="360" rx="30" fill="${light}" opacity=".55"/>
        <rect x="480" y="620" width="240" height="140" rx="14" fill="#FFFFFF" opacity=".6"/>`;
    case "lipstick":
      return `<rect x="500" y="620" width="200" height="340" rx="20" fill="${accent}"/>
        <rect x="520" y="520" width="160" height="120" rx="10" fill="${shade(accent, 0.3)}"/>
        <path d="M540 520 V340 Q540 280 640 240 L660 240 V520 Z" fill="${main}"/>
        <rect x="550" y="360" width="22" height="150" rx="11" fill="${light}" opacity=".5"/>`;
    case "palette": {
      const cells = Array.from({ length: 12 }, (_, i) => {
        const x = 380 + (i % 4) * 115;
        const y = 470 + Math.floor(i / 4) * 115;
        return `<rect x="${x}" y="${y}" width="95" height="95" rx="18" fill="${shade(main, (i % 5) * 0.12 - 0.25)}"/>`;
      }).join("");
      return `<rect x="340" y="420" width="520" height="400" rx="40" fill="${accent}"/>${cells}`;
    }
    case "watch":
      return `<rect x="520" y="180" width="160" height="230" rx="30" fill="${main}"/>
        <rect x="520" y="790" width="160" height="230" rx="30" fill="${main}"/>
        <circle cx="600" cy="600" r="230" fill="${main}"/>
        <circle cx="600" cy="600" r="195" fill="${accent}"/>
        <circle cx="600" cy="600" r="195" fill="none" stroke="${dark}" stroke-width="8"/>
        ${Array.from({ length: 12 }, (_, i) => {
          const a = (i * Math.PI) / 6;
          return `<rect x="595" y="420" width="10" height="34" fill="${dark}" transform="rotate(${(a * 180) / Math.PI} 600 600)"/>`;
        }).join("")}
        <rect x="594" y="480" width="12" height="125" rx="6" fill="${dark}"/>
        <rect x="594" y="520" width="12" height="90" rx="6" fill="${dark}" transform="rotate(115 600 600)"/>
        <circle cx="600" cy="600" r="14" fill="${dark}"/>
        <rect x="826" y="580" width="40" height="40" rx="8" fill="${main}"/>`;
    case "bear":
      return `<circle cx="450" cy="300" r="80" fill="${main}"/><circle cx="750" cy="300" r="80" fill="${main}"/>
        <circle cx="450" cy="300" r="42" fill="${accent}"/><circle cx="750" cy="300" r="42" fill="${accent}"/>
        <ellipse cx="600" cy="780" rx="240" ry="210" fill="${main}"/>
        <ellipse cx="600" cy="800" rx="140" ry="130" fill="${accent}"/>
        <circle cx="600" cy="420" r="200" fill="${main}"/>
        <ellipse cx="600" cy="480" rx="80" ry="60" fill="${accent}"/>
        <circle cx="530" cy="390" r="18" fill="#2F3B2C"/><circle cx="670" cy="390" r="18" fill="#2F3B2C"/>
        <ellipse cx="600" cy="460" rx="26" ry="18" fill="#2F3B2C"/>
        <ellipse cx="400" cy="900" rx="80" ry="60" fill="${main}"/><ellipse cx="800" cy="900" rx="80" ry="60" fill="${main}"/>
        <path d="M560 830 q40 -50 80 0 q-40 50 -80 0z" fill="${accent === "#B3263E" ? "#B3263E" : shade(main, -0.3)}"/>`;
    case "dress":
      return `<path d="M520 220 h160 l40 160 h-240z" fill="${main}"/>
        <path d="M480 380 h240 l170 600 h-580z" fill="${main}"/>
        <path d="M480 380 h240 l-20 70 h-200z" fill="${accent}"/>
        <path d="M560 470 l-130 500 M640 470 l130 500" stroke="${dark}" stroke-width="6" opacity=".5"/>
        <path d="M520 220 q80 60 160 0" stroke="${accent}" stroke-width="10" fill="none"/>`;
    case "abaya":
      return `<path d="M520 200 h160 l60 120 l170 660 h-660 l170 -660z" fill="${main}"/>
        <path d="M600 210 v770" stroke="${accent}" stroke-width="14"/>
        <path d="M440 330 l-110 380 l60 20 l100 -300z M760 330 l110 380 l-60 20 l-100 -300z" fill="${dark}"/>
        <path d="M330 710 h60 M810 710 h60" stroke="${accent}" stroke-width="16"/>`;
    case "shila":
      return `<path d="M300 300 Q600 180 900 300 L860 980 Q600 900 340 980 Z" fill="${main}"/>
        <path d="M340 980 Q600 900 860 980" stroke="${accent}" stroke-width="22" fill="none"/>
        <path d="M300 300 Q600 180 900 300" stroke="${accent}" stroke-width="14" fill="none"/>
        ${Array.from({ length: 6 }, (_, i) => `<circle cx="${420 + i * 72}" cy="${640 + (i % 2) * 40}" r="16" fill="${accent}"/>`).join("")}
        <path d="M420 420 Q600 520 780 420" stroke="${shade(main, -0.12)}" stroke-width="10" fill="none"/>`;
    case "gift-box":
      return `<rect x="330" y="470" width="540" height="470" rx="20" fill="${main}"/>
        <rect x="300" y="380" width="600" height="130" rx="20" fill="${shade(main, -0.12)}"/>
        <rect x="565" y="380" width="70" height="560" fill="${accent}"/>
        <path d="M600 380 q-170 -180 -200 -30 q90 60 200 30 q110 30 200 -30 q-30 -150 -200 30z" fill="${accent}"/>`;
    case "bag":
      return `<path d="M480 380 q0 -170 120 -170 q120 0 120 170" stroke="${accent}" stroke-width="22" fill="none"/>
        <path d="M340 380 h520 l40 580 h-600z" fill="${main}"/>
        <rect x="340" y="380" width="520" height="60" fill="${shade(main, -0.12)}"/>`;
    case "ribbon":
      return `<circle cx="600" cy="600" r="300" fill="${main}"/>
        <circle cx="600" cy="600" r="250" fill="${shade(main, -0.12)}"/>
        <circle cx="600" cy="600" r="120" fill="${accent}"/>
        <circle cx="600" cy="600" r="80" fill="#FFFFFF"/>
        <path d="M860 720 q120 60 180 220 l-70 -20 l-20 70 q-40 -150 -160 -200z" fill="${main}"/>`;
  }
}

/** SVG مربّع 1200×1200 لصورة منتج. */
export function productSvg(shape: Shape, colors: [string, string], fullBleed = false): string {
  const background = fullBleed
    ? `<rect width="${S}" height="${S}" fill="#E6DCCB"/>
       <rect y="820" width="${S}" height="380" fill="#B89470"/>
       <rect y="820" width="${S}" height="18" fill="#9E7A57"/>
       <circle cx="980" cy="220" r="140" fill="#F3EEE4" opacity=".7"/>`
    : `<rect width="${S}" height="${S}" fill="#FFFFFF"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
    ${background}${drawing(shape, colors[0], colors[1])}</svg>`;
}
