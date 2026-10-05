export const locales = ["tr", "en", "ar"] as const;
export type AppLocale = (typeof locales)[number];
export function asLocale(value?: string | null): AppLocale | undefined {
  const normalized = value?.toLowerCase();
  return locales.find((locale) => locale === normalized);
}
export function resolveLocale(
  saved?: string | null,
  cookie?: string | null,
  acceptLanguage = "",
): AppLocale {
  const preferred = asLocale(saved) ?? asLocale(cookie);
  if (preferred) return preferred;
  const candidates = acceptLanguage
    .split(",")
    .map((entry, index) => {
      const [tag, ...options] = entry.trim().split(";");
      const quality = options.find((option) => option.trim().startsWith("q="));
      return {
        locale: asLocale(tag.split("-")[0]),
        quality: quality ? Number(quality.trim().slice(2)) : 1,
        index,
      };
    })
    .filter((entry) => entry.locale && entry.quality > 0 && entry.quality <= 1)
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return candidates[0]?.locale ?? "tr";
}
