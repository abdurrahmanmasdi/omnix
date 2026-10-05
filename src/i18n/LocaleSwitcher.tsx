"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAppLocale } from "./provider";
import { asLocale } from "./locale";
import { useAuthStore } from "@/store/auth-store";
import { useUserLocaleControllerUpdateLocale } from "@/lib/api/generated/users/users";
import { UserLocale } from "@/lib/api/model";

export function LocaleSwitcher() {
  const { locale, setLocale } = useAppLocale();
  const t = useTranslations("Language");
  const [failed, setFailed] = useState(false);
  const mutation = useUserLocaleControllerUpdateLocale();
  return (
    <div className="flex flex-col">
      <select
        aria-label={t("label")}
        value={locale}
        disabled={mutation.isPending}
        className="rounded-md border border-border bg-background p-2 text-sm"
        onChange={async (event) => {
          const next = asLocale(event.target.value);
          if (!next) return;
          setFailed(false);
          const state = useAuthStore.getState();
          if (state.user && state.accessToken) {
            try {
              const response = await mutation.mutateAsync({
                data: {
                  locale:
                    UserLocale[next.toUpperCase() as keyof typeof UserLocale],
                },
              });
              const current = useAuthStore.getState();
              if (current.user?.id !== state.user.id || !current.accessToken)
                return;
              current.setAuth(current.accessToken, {
                ...current.user,
                locale: response.locale,
              });
            } catch {
              setFailed(true);
              return;
            }
          }
          setLocale(next);
        }}
      >
        <option value="tr">TR</option>
        <option value="en">EN</option>
        <option value="ar">العربية</option>
      </select>
      {failed && (
        <span role="alert" className="text-xs text-red-400">
          {t("failed")}
        </span>
      )}
    </div>
  );
}
