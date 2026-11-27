"use client";

import { Search } from "lucide-react";
import Image from "next/image";
import { useCallback, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";
import { CartLink } from "./cart-link";
import { MenuButton } from "./mobile-menu";
import { PRESS } from "./press";

/**
 * شريط الجوال المختصر (D-157): الرأس الكامل (~165px) يذهب مع الصفحة، فحين يخرج من الشاشة يظهر في
 * الأعلى شريط ثابت فيه الشعار والبحث والسلة بعددها — يرى الزبون السلة بعد «+» دون الرجوع للأعلى.
 * زر البحث يرجع لأعلى الصفحة ويضع المؤشر في خانة البحث. الحاسوب بلا تغيير.
 */
export function CompactBar({
  headerId,
  searchId,
  logo,
  labels,
}: {
  headerId: string;
  searchId: string;
  logo: { src: string; width: number; alt: string };
  labels: { home: string; search: string };
}) {
  // موضع الرأس يُقرأ مباشرة عند التمرير وتغيير المقاس (لا IntersectionObserver): في Safari قد يأتي أول
  // إشعار منه خاطئاً فيبقى الشريط ظاهراً فوق الرأس في أعلى الصفحة حتى يتحرك الزبون.
  const subscribe = useCallback((onChange: () => void) => {
    window.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);
  const shown = useSyncExternalStore(
    subscribe,
    () => {
      const header = document.getElementById(headerId);
      return !!header && header.getBoundingClientRect().bottom <= 0;
    },
    () => false,
  );

  return (
    <div
      aria-hidden={!shown}
      inert={!shown}
      className={`fixed inset-x-0 top-0 z-40 border-b border-line bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm transition-transform duration-200 motion-reduce:transition-none md:hidden ${shown ? "translate-y-0" : "-translate-y-full"}`}
    >
      <div className="flex h-[52px] items-center gap-1 px-4">
        <MenuButton className="-ms-2" />
        <Link href="/" aria-label={labels.home} className="me-auto shrink-0">
          <Image src={logo.src} alt={logo.alt} width={Math.round(logo.width * 0.8)} height={29} />
        </Link>
        <button
          type="button"
          aria-label={labels.search}
          onClick={() => {
            window.scrollTo({ top: 0 });
            document.getElementById(searchId)?.focus();
          }}
          className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-muted ${PRESS}`}
        >
          <Search aria-hidden className="size-5" strokeWidth={1.8} />
        </button>
        <CartLink />
      </div>
    </div>
  );
}
