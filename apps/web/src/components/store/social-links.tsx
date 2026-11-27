/**
 * أيقونات حسابات المتجر (D-160): إنستغرام وتيك توك وواتساب — كل أيقونة تظهر فقط إن ضُبط حسابها في «الضبط».
 * رسوم خطية بسيطة بلون النص (بلا شعارات ملوّنة) لتتسق مع أيقونات المتجر.
 */
export type SocialHrefs = { instagram: string | null; tiktok: string | null; whatsapp: string | null };

const paths = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </>
  ),
  tiktok: (
    <>
      <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
      <path d="M14 3c.6 2.8 2.4 4.4 5 4.6" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.3-4A8 8 0 1 1 8 18.7z" />
      <path d="M9 9.5c.3 2 2.4 4.2 4.5 4.6l1.2-1.2 1.8.8" />
    </>
  ),
};

export function SocialLinks({
  hrefs,
  labels,
  className = "",
  itemClassName = "",
}: {
  hrefs: SocialHrefs;
  labels: Record<keyof SocialHrefs, string>;
  className?: string;
  itemClassName?: string;
}) {
  const items = (Object.keys(paths) as (keyof SocialHrefs)[]).filter((k) => hrefs[k]);
  if (!items.length) return null;
  return (
    <ul className={`flex items-center gap-2 ${className}`}>
      {items.map((k) => (
        <li key={k}>
          <a
            href={hrefs[k]!}
            target="_blank"
            rel="noreferrer"
            aria-label={labels[k]}
            className={`flex size-11 items-center justify-center rounded-full ${itemClassName}`}
          >
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="size-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {paths[k]}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
