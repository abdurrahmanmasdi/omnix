"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { useUserProfileControllerGet } from "@/lib/api/generated/users/users";
import { useInvitationsControllerIssueClinic } from "@/lib/api/generated/authentication/authentication";
import {
  useClinicTeamControllerMembers,
  useClinicTeamControllerInvitations,
  useClinicTeamControllerRoles,
  useClinicTeamControllerRevoke,
  getClinicTeamControllerInvitationsQueryKey,
} from "@/lib/api/generated/clinic-team/clinic-team";
import type {
  ClinicInvitationIssuedDto,
  PendingClinicInvitationDto,
} from "@/lib/api/model";
import { useAuthStore } from "@/store/auth-store";
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

export default function TeamPage() {
  const t = useTranslations("Team");
  const locale = useLocale();
  const backendError = useBackendError();
  const user = useAuthStore((s) => s.user);
  const profile = useUserProfileControllerGet();
  const allowed = !!profile.data?.memberships.find(
    (m) => m.organizationId === user?.organizationId,
  )?.canManageTeam;
  const members = useClinicTeamControllerMembers({
    query: { enabled: allowed, retry: false },
  });
  const invitations = useClinicTeamControllerInvitations({
    query: { enabled: allowed, retry: false },
  });
  const roles = useClinicTeamControllerRoles({
    query: { enabled: allowed, retry: false },
  });
  const issue = useInvitationsControllerIssueClinic();
  const revoke = useClinicTeamControllerRevoke();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState("");
  const [issued, setIssued] = useState<ClinicInvitationIssuedDto | null>(null);
  const [confirm, setConfirm] = useState<PendingClinicInvitationDto | null>(
    null,
  );
  const [error, setError] = useState<unknown>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Istanbul",
    }).format(new Date(value));
  const role = (name: string) =>
    t.has(`roles.${name}`) ? t(`roles.${name}`) : name;
  const readError = (value: unknown, retry: () => void) => (
    <div role="alert" className="space-y-2">
      <p>{backendError(value, t("loadFailed"))}</p>
      <Button onClick={retry}>{t("retry")}</Button>
    </div>
  );
  const close = (next: boolean) => {
    if (issue.isPending) return;
    setOpen(next);
    setError(null);
    setLocalError(null);
    setCopied(false);
    if (!next) {
      setIssued(null);
      setEmail("");
      setRoleId("");
    }
  };
  if (profile.isLoading)
    return (
      <p role="status" className="p-8">
        {t("loading")}
      </p>
    );
  if (profile.isError)
    return (
      <div className="p-8">
        {readError(profile.error, () => {
          void profile.refetch();
        })}
      </div>
    );
  if (!allowed)
    return (
      <p role="alert" className="p-8">
        {t("noAccess")}
      </p>
    );
  const link = issued
    ? `${window.location.origin}/accept-invitation#type=clinic&token=${encodeURIComponent(issued.token)}`
    : "";
  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-muted-foreground">{t("description")}</p>
        </div>
        <Button
          disabled={!roles.data?.length || roles.isError}
          onClick={() => {
            setOpen(true);
            setRevoked(false);
          }}
        >
          {t("invite")}
        </Button>
      </div>
      {revoked && <p role="status">{t("revoked")}</p>}
      {roles.isError ? (
        readError(roles.error, () => {
          void roles.refetch();
        })
      ) : roles.isLoading ? (
        <p role="status">{t("loading")}</p>
      ) : !roles.data?.length ? (
        <p>{t("noRoles")}</p>
      ) : null}
      <section className="rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-xl font-semibold">{t("members")}</h2>
        {members.isLoading ? (
          <p role="status">{t("loading")}</p>
        ) : members.isError ? (
          readError(members.error, () => {
            void members.refetch();
          })
        ) : members.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr>
                  {["name", "email", "role", "status", "joined"].map((key) => (
                    <th key={key} className="text-start p-3">
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.data.map((m) => (
                  <tr key={m.id} className="border-t border-border">
                    <td className="p-3">
                      {`${m.firstName} ${m.lastName}`.trim() || m.email}
                    </td>
                    <td className="p-3 break-all">{m.email}</td>
                    <td className="p-3">{role(m.roleName)}</td>
                    <td className="p-3">
                      {t.has(`statuses.${m.status}`)
                        ? t(`statuses.${m.status}`)
                        : m.status}
                    </td>
                    <td className="p-3 whitespace-nowrap">
                      {date(m.joinedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>{t("noMembers")}</p>
        )}
      </section>
      <section className="rounded-xl border border-border p-4 space-y-4">
        <h2 className="text-xl font-semibold">{t("pending")}</h2>
        {invitations.isLoading ? (
          <p role="status">{t("loading")}</p>
        ) : invitations.isError ? (
          readError(invitations.error, () => {
            void invitations.refetch();
          })
        ) : invitations.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr>
                  {["email", "role", "expires", "issuer", "actions"].map(
                    (key) => (
                      <th key={key} className="text-start p-3">
                        {t(key)}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {invitations.data.map((inv) => (
                  <tr key={inv.id} className="border-t border-border">
                    <td className="p-3 break-all">{inv.email}</td>
                    <td className="p-3">{role(inv.roleName)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {date(inv.expiresAt)}
                    </td>
                    <td className="p-3 break-all">{inv.issuer}</td>
                    <td className="p-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setConfirm(inv);
                          setError(null);
                          setRevoked(false);
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
        ) : (
          <p>{t("noInvitations")}</p>
        )}
      </section>
      <Dialog open={open} onOpenChange={close}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t(issued ? "inviteReady" : "invite")}</DialogTitle>
            <DialogDescription>{t("noEmail")}</DialogDescription>
          </DialogHeader>
          {issued ? (
            <div className="space-y-4">
              <label className="grid gap-2">
                {t("link")}
                <Input readOnly value={link} className="font-mono" dir="ltr" />
              </label>
              <p>
                {t("expires")}: {date(issued.expiresAt)}
              </p>
              <p>
                {t(issued.createsAccount ? "newAccount" : "existingAccount")}
              </p>
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(link);
                    setCopied(true);
                    setLocalError(null);
                  } catch {
                    setLocalError("copyFailed");
                  }
                }}
              >
                {t("copyLink")}
              </Button>
              {copied && <p role="status">{t("copied")}</p>}
            </div>
          ) : (
            <form
              className="grid gap-4"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLocalError(null);
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                  setLocalError("invalidEmail");
                  return;
                }
                if (!roles.data?.some((r) => r.id === roleId)) {
                  setLocalError("chooseRole");
                  return;
                }
                try {
                  const result = await issue.mutateAsync({
                    data: { email: email.trim(), roleId },
                  });
                  setIssued(result);
                  await qc.invalidateQueries({
                    queryKey: getClinicTeamControllerInvitationsQueryKey(),
                  });
                } catch (err) {
                  setError(err);
                }
              }}
            >
              <label className="grid gap-2">
                {t("email")}
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <label className="grid gap-2">
                {t("role")}
                <select
                  className="rounded-md border border-border bg-background p-2"
                  value={roleId}
                  onChange={(e) => setRoleId(e.target.value)}
                  required
                >
                  <option value="">{t("chooseRole")}</option>
                  {roles.data?.map((r) => (
                    <option key={r.id} value={r.id}>
                      {role(r.name)}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" disabled={issue.isPending}>
                {t(issue.isPending ? "creating" : "create")}
              </Button>
            </form>
          )}
          {localError && <p role="alert">{t(localError)}</p>}
          {error != null && (
            <p role="alert">{backendError(error, t("saveFailed"))}</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirm}
        onOpenChange={(next) => {
          if (!next && !revoke.isPending) {
            setConfirm(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("revoke")}</DialogTitle>
            <DialogDescription>
              {t("revokeConfirm", { email: confirm?.email ?? "" })}
            </DialogDescription>
          </DialogHeader>
          {error != null && (
            <p role="alert">{backendError(error, t("saveFailed"))}</p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              disabled={revoke.isPending}
              onClick={() => setConfirm(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              disabled={revoke.isPending}
              onClick={async () => {
                if (!confirm) return;
                setError(null);
                try {
                  await revoke.mutateAsync({ id: confirm.id });
                  await qc.invalidateQueries({
                    queryKey: getClinicTeamControllerInvitationsQueryKey(),
                  });
                  setConfirm(null);
                  setRevoked(true);
                } catch (err) {
                  setError(err);
                }
              }}
            >
              {t(revoke.isPending ? "revoking" : "confirmRevoke")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
