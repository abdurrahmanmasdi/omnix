import { useTranslations } from "next-intl";
import keys from "./ui-keys.json";
const messageKeys: Record<string, string> = keys;
const cached = new WeakMap<
  ReturnType<typeof useTranslations>,
  (text?: string | null) => string
>();
// The source phrase is also the fallback for user-defined labels and old errors.
export function useCopy() {
  const t = useTranslations("UI");
  let copy = cached.get(t);
  if (!copy) {
    copy = (text) => {
      if (!text) return "";
      const key = messageKeys[text];
      return key && t.has(key) ? t(key) : text;
    };
    cached.set(t, copy);
  }
  return copy;
}
