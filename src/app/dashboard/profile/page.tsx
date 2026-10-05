"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUserProfileControllerGet,
  useUserProfileControllerUpdate,
  useUserProfileControllerPassword,
  getUserProfileControllerGetQueryKey,
} from "@/lib/api/generated/users/users";
import { useAuthStore } from "@/store/auth-store";
import { useBackendError } from "@/i18n/backend";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const phonePattern = /^(?:\+[1-9]\d{6,14})?$/;
export default function ProfilePage() {
  const t = useTranslations("Profile");
  const errorText = useBackendError();
  const query = useUserProfileControllerGet();
  const update = useUserProfileControllerUpdate();
  const password = useUserProfileControllerPassword();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phoneNumber: "",
    whatsappNumber: "",
    spokenLanguages: "",
  });
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [serverError, setServerError] = useState<unknown>(null);
  useEffect(() => {
    if (query.data)
      setForm({
        firstName: query.data.firstName,
        lastName: query.data.lastName,
        phoneNumber:
          typeof query.data.phoneNumber === "string"
            ? query.data.phoneNumber
            : "",
        whatsappNumber:
          typeof query.data.whatsappNumber === "string"
            ? query.data.whatsappNumber
            : "",
        spokenLanguages: query.data.spokenLanguages.join(", "),
      });
  }, [query.data]);
  const resetNotice = () => {
    setNotice(null);
    setFailure(null);
    setServerError(null);
  };
  if (query.isLoading) return <p className="p-8">{t("loading")}</p>;
  if (!query.data)
    return (
      <div role="alert" className="p-8">
        {errorText(query.error, t("loadFailed"))}
        <Button onClick={() => query.refetch()}>{t("retry")}</Button>
      </div>
    );
  const profile = query.data;
  const field = (name: keyof typeof form, autoComplete?: string) => (
    <label className="grid gap-2" key={name}>
      {t(name)}
      <Input
        value={form[name]}
        maxLength={
          name.endsWith("Number") ? 16 : name === "spokenLanguages" ? 1100 : 100
        }
        autoComplete={autoComplete}
        onChange={(e) => setForm({ ...form, [name]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="mx-auto max-w-3xl space-y-8 p-4 md:p-8">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      {notice && <p role="status">{t(notice)}</p>}
      {failure && <p role="alert">{t(failure)}</p>}
      {serverError != null && (
        <p role="alert">{errorText(serverError, t("saveFailed"))}</p>
      )}
      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">{t("personal")}</h2>
        <label className="grid gap-2">
          {t("email")}
          <Input value={profile.email} readOnly />
        </label>
        <p className="text-sm text-muted-foreground">{t("emailHelp")}</p>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            resetNotice();
            if (!form.firstName.trim() || !form.lastName.trim()) {
              setFailure("namesRequired");
              return;
            }
            if (
              !phonePattern.test(form.phoneNumber) ||
              !phonePattern.test(form.whatsappNumber)
            ) {
              setFailure("invalidPhone");
              return;
            }
            const spokenLanguages = form.spokenLanguages
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            if (
              spokenLanguages.length > 20 ||
              spokenLanguages.some((s) => s.length > 50)
            ) {
              setFailure("invalidLanguages");
              return;
            }
            try {
              const result = await update.mutateAsync({
                data: {
                  ...form,
                  firstName: form.firstName.trim(),
                  lastName: form.lastName.trim(),
                  spokenLanguages,
                },
              });
              qc.setQueryData(getUserProfileControllerGetQueryKey(), result);
              const state = useAuthStore.getState();
              if (state.user?.id === result.id && state.accessToken)
                state.setAuth(state.accessToken, {
                  ...state.user,
                  firstName: result.firstName,
                  lastName: result.lastName,
                  locale: result.locale,
                });
              setNotice("saved");
            } catch (error) {
              setServerError(error);
            }
          }}
        >
          {field("firstName", "given-name")}
          {field("lastName", "family-name")}
          {field("phoneNumber", "tel")}
          {field("whatsappNumber")}
          {field("spokenLanguages")}
          <p className="text-sm text-muted-foreground">{t("languagesHelp")}</p>
          <Button type="submit" disabled={update.isPending}>
            {t(update.isPending ? "saving" : "save")}
          </Button>
        </form>
      </section>
      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">{t("language")}</h2>
        <LocaleSwitcher />
      </section>
      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">{t("password")}</h2>
        <p className="text-sm text-muted-foreground">{t("passwordHelp")}</p>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            resetNotice();
            if (
              !currentPassword ||
              newPassword.length < 12 ||
              new TextEncoder().encode(newPassword).length > 72
            ) {
              setFailure("invalidPassword");
              return;
            }
            if (newPassword !== confirmation) {
              setFailure("passwordMismatch");
              return;
            }
            const identity = useAuthStore.getState().user?.id;
            try {
              const result = await password.mutateAsync({
                data: { currentPassword, newPassword },
              });
              const state = useAuthStore.getState();
              if (state.user?.id === identity && state.user)
                state.setAuth(result.access_token, state.user);
              setCurrent("");
              setNew("");
              setConfirmation("");
              setNotice("passwordSaved");
            } catch (error) {
              setServerError(error);
            }
          }}
        >
          <label className="grid gap-2">
            {t("currentPassword")}
            <Input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label className="grid gap-2">
            {t("newPassword")}
            <Input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNew(e.target.value)}
            />
          </label>
          <label className="grid gap-2">
            {t("confirmPassword")}
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={password.isPending}>
            {t(password.isPending ? "saving" : "changePassword")}
          </Button>
        </form>
      </section>
      <section className="rounded-xl border border-border p-5 space-y-4">
        <h2 className="text-xl font-semibold">{t("memberships")}</h2>
        {profile.memberships.length ? (
          <ul className="space-y-3">
            {profile.memberships.map((m) => (
              <li key={m.organizationId}>
                <strong>{m.organizationName}</strong>
                <p>
                  {m.roleName} ·{" "}
                  {t.has(`status.${m.status}`)
                    ? t(`status.${m.status}`)
                    : m.status}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("noMemberships")}</p>
        )}
      </section>
    </div>
  );
}
