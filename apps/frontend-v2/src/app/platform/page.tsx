"use client";
import { PlatformLinkResult } from "./PlatformLinkResult";
import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthControllerGetProfile } from "@/lib/api/generated/authentication/authentication";
import {
  usePlatformControllerClinics,
  usePlatformControllerInvitations,
  usePlatformControllerInvite,
  usePlatformControllerRecovery,
  usePlatformControllerRevoke,
  getPlatformControllerInvitationsQueryKey,
} from "@/lib/api/generated/platform/platform";
import type { PlatformInvitationDto, PlatformLinkDto } from "@/lib/api/model";
import { LocaleSwitcher } from "@/i18n/LocaleSwitcher";
import { useBackendError } from "@/i18n/backend";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function PlatformPage() {
  const t = useTranslations("Platform");
  const locale = useLocale();
  const backendError = useBackendError();
  const profile = useAuthControllerGetProfile({ query: { retry: false } });
  const allowed =
    !profile.isError && profile.data?.user.isPlatformAdmin === true;
  const clinics = usePlatformControllerClinics({
    query: { enabled: allowed, retry: false },
  });
  const invitations = usePlatformControllerInvitations({
    query: { enabled: allowed, retry: false },
  });
  const invite = usePlatformControllerInvite();
  const recovery = usePlatformControllerRecovery();
  const revoke = usePlatformControllerRevoke();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"invite" | "recovery" | null>(null);
  const [email, setEmail] = useState("");
  const [issued, setIssued] = useState<PlatformLinkDto | null>(null);
  const [confirm, setConfirm] = useState<PlatformInvitationDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const pending = invite.isPending || recovery.isPending;
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  const failure = (value: unknown, retry: () => void) => (
    <div role="alert">
      <p>{backendError(value, t("loadFailed"))}</p>
      <Button onClick={retry}>{t("retry")}</Button>
    </div>
  );
  const close = () => {
    if (pending) return;
    setMode(null);
    setEmail("");
    setIssued(null);
    setError(null);
    setLocalError(null);
  };
  const open = (next: "invite" | "recovery") => {
    setMode(next);
    setError(null);
    setLocalError(null);
    setSuccess(false);
    setIssued(null);
    setEmail("");
  };
  if (profile.isLoading)
    return (
      <p role="status" className="p-8">
        {t("loading")}
      </p>
    );
  if (profile.isError)
    return (
      <main className="p-8">
        {failure(profile.error, () => void profile.refetch())}
      </main>
    );
  if (!allowed)
    return (
      <main className="p-8">
        <h1>{t("notFound")}</h1>
        <Link href="/dashboard">{t("back")}</Link>
      </main>
    );
  return (
    <main className="min-h-screen bg-brand-navy text-brand-ice p-4 md:p-8 space-y-6">
      <div className="flex justify-between gap-4">
        <Link href="/dashboard">{t("back")}</Link>
        <LocaleSwitcher />
      </div>
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p>{t("description")}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => open("invite")}>{t("invite")}</Button>
        <Button onClick={() => open("recovery")}>{t("recovery")}</Button>
      </div>
      {success && <p role="status">{t("revoked")}</p>}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("clinics")}</h2>
        {clinics.isLoading ? (
          <p role="status">{t("loading")}</p>
        ) : clinics.isError ? (
          failure(clinics.error, () => void clinics.refetch())
        ) : !clinics.data?.length ? (
          <p>{t("noClinics")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr>
                  {["name", "created", "active", "members", "owners"].map(
                    (k) => (
                      <th key={k} className="p-3 text-start">
                        {t(k)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {clinics.data.map((c) => (
                  <tr key={c.id} className="border-t border-white/10">
                    <td className="p-3">{c.name}</td>
                    <td className="p-3">{date(c.createdAt)}</td>
                    <td className="p-3">{t(c.isActive ? "yes" : "no")}</td>
                    <td className="p-3">
                      {new Intl.NumberFormat(locale).format(c.memberCount)}
                    </td>
                    <td className="p-3">
                      {c.ownerEmails.join(", ") || t("noOwner")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">{t("invitations")}</h2>
        {invitations.isLoading ? (
          <p role="status">{t("loading")}</p>
        ) : invitations.isError ? (
          failure(invitations.error, () => void invitations.refetch())
        ) : !invitations.data?.length ? (
          <p>{t("noInvitations")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr>
                  {["email", "issuer", "expiry", "actions"].map((k) => (
                    <th key={k} className="p-3 text-start">
                      {t(k)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invitations.data.map((i) => (
                  <tr key={i.id} className="border-t border-white/10">
                    <td className="p-3">{i.email}</td>
                    <td className="p-3">{i.issuer}</td>
                    <td className="p-3">{date(i.expiresAt)}</td>
                    <td className="p-3">
                      <Button
                        onClick={() => {
                          setConfirm(i);
                          setError(null);
                          setLocalError(null);
                          setSuccess(false);
                        }}
                      >
                        {t("revoke")}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <Dialog
        open={mode !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(mode === "recovery" ? "recovery" : "invite")}
            </DialogTitle>
            <DialogDescription>
              {t(mode === "recovery" ? "recoveryNote" : "inviteNote")}
            </DialogDescription>
          </DialogHeader>
          {issued ? (
            <PlatformLinkResult issued={issued} date={date} onClose={close} />
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLocalError(null);
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                  setLocalError(t("invalidEmail"));
                  return;
                }
                try {
                  const result = await (
                    mode === "recovery" ? recovery : invite
                  ).mutateAsync({ data: { email: email.trim() } });
                  setIssued(result);
                  if (mode === "invite")
                    await qc.invalidateQueries({
                      queryKey: getPlatformControllerInvitationsQueryKey(),
                    });
                } catch (err) {
                  setError(err);
                }
              }}
            >
              <label htmlFor="platform-email">{t("email")}</label>
              <Input
                id="platform-email"
                type="email"
                maxLength={254}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={pending}
              />
              <Button type="submit" disabled={pending}>
                {t(pending ? "working" : "generate")}
              </Button>
            </form>
          )}
          {(error != null || localError) && (
            <p role="alert">
              {localError ?? backendError(error, t("actionFailed"))}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next && !revoke.isPending) {
            setConfirm(null);
            setError(null);
            setLocalError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("confirmRevoke")}</DialogTitle>
            <DialogDescription>
              {t("confirmNote", { email: confirm?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {(error != null || localError) && (
            <p role="alert">
              {localError ?? backendError(error, t("actionFailed"))}
            </p>
          )}
          <Button
            disabled={revoke.isPending}
            onClick={() => {
              setConfirm(null);
              setError(null);
              setLocalError(null);
            }}
          >
            {t("cancel")}
          </Button>
          <Button
            disabled={revoke.isPending}
            onClick={async () => {
              if (!confirm) return;
              setError(null);
              setLocalError(null);
              try {
                await revoke.mutateAsync({ id: confirm.id });
                await qc.invalidateQueries({
                  queryKey: getPlatformControllerInvitationsQueryKey(),
                });
                setConfirm(null);
                setSuccess(true);
              } catch (err) {
                setError(err);
              }
            }}
          >
            {t(revoke.isPending ? "working" : "revoke")}
          </Button>
        </DialogContent>
      </Dialog>
    </main>
  );
}
