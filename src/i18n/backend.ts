"use client";
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { useCopy } from "./copy";

export function useBackendError() {
  const t = useTranslations("Errors");
  const copy = useCopy();
  return (error: unknown, fallback: string): string => {
    const data = (
      error as {
        response?: { data?: { code?: string; message?: string | string[] } };
      }
    )?.response?.data;
    if (data?.code && t.has(data.code)) return t(data.code);
    const text = data?.message;
    return copy(
      Array.isArray(text)
        ? text.map((part) => copy(part)).join(" ")
        : text || fallback,
    );
  };
}
export function useNotificationText() {
  const t = useTranslations("Notifications");
  return useCallback(
    (
      row: {
        code?: string | null;
        params?: Record<string, unknown> | null;
        title?: string;
        body?: string;
      },
      field: "title" | "body",
    ) => {
      const key = `${row.code}.${field}`;
      if (!row.code || !t.has(key)) return row[field] ?? "";
      const params: Record<string, string | number> = { name: "", preview: "" };
      for (const [name, value] of Object.entries(row.params ?? {}))
        if (typeof value === "string" || typeof value === "number")
          params[name] = value;
      return t(key, params);
    },
    [t],
  );
}
