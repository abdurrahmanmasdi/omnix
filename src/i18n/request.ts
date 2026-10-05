import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { resolveLocale } from "./locale";
import { messages } from "./messages";

export default getRequestConfig(async () => {
  const locale = resolveLocale(
    null,
    (await cookies()).get("NEXT_LOCALE")?.value,
    (await headers()).get("accept-language") ?? "",
  );
  return { locale, messages: messages[locale], timeZone: "Europe/Istanbul" };
});
