"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import {
  useClinicTeamControllerChangeRole,
  useClinicTeamControllerRemoveMember,
  getClinicTeamControllerMembersQueryKey,
} from "@/lib/api/generated/clinic-team/clinic-team";
import type { ClinicMemberDto, GrantableClinicRoleDto } from "@/lib/api/model";
import { useAuthStore } from "@/store/auth-store";
import { useBackendError } from "@/i18n/backend";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function MemberActions({
  member,
  roles,
  allowed,
  onChanged,
}: {
  member: ClinicMemberDto;
  roles: GrantableClinicRoleDto[];
  allowed: boolean;
  onChanged: (mode: "role" | "remove") => void;
}) {
  const t = useTranslations("Team");
  const backendError = useBackendError();
  const userId = useAuthStore((s) => s.user?.id);
  const change = useClinicTeamControllerChangeRole();
  const remove = useClinicTeamControllerRemoveMember();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"role" | "remove" | null>(null);
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<unknown>(null);
  const pending = change.isPending || remove.isPending;
  if (!allowed || member.userId === userId) return null;
  const start = (next: "role" | "remove") => {
    setMode(next);
    setRoleId("");
    setError(null);
  };
  const close = () => {
    if (!pending) {
      setMode(null);
      setError(null);
      setRoleId("");
    }
  };
  const submit = async () => {
    if (!mode) return;
    setError(null);
    try {
      if (mode === "role") {
        if (!roles.some((r) => r.id === roleId)) return;
        await change.mutateAsync({ membershipId: member.id, data: { roleId } });
      } else await remove.mutateAsync({ membershipId: member.id });
      await qc.invalidateQueries({
        queryKey: getClinicTeamControllerMembersQueryKey(),
      });
      onChanged(mode);
      setMode(null);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button disabled={!roles.length} onClick={() => start("role")}>
          {t("changeRole")}
        </Button>
        <Button onClick={() => start("remove")}>{t("removeMember")}</Button>
      </div>
      <Dialog
        open={mode !== null}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t(mode === "remove" ? "removeTitle" : "changeRoleTitle")}
            </DialogTitle>
            <DialogDescription>
              {t(mode === "remove" ? "removeNote" : "changeRoleNote", {
                email: member.email,
              })}
            </DialogDescription>
          </DialogHeader>
          {mode === "role" && (
            <>
              <label htmlFor={`member-role-${member.id}`}>{t("role")}</label>
              <select
                id={`member-role-${member.id}`}
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                disabled={pending}
                className="bg-background border border-border rounded-md p-2"
              >
                <option value="">{t("selectRole")}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {t.has(`roles.${r.name}`) ? t(`roles.${r.name}`) : r.name}
                  </option>
                ))}
              </select>
            </>
          )}
          {error != null && (
            <p role="alert">{backendError(error, t("actionFailed"))}</p>
          )}
          <Button disabled={pending} onClick={close}>
            {t("cancel")}
          </Button>
          <Button
            disabled={
              pending ||
              (mode === "role" && !roles.some((r) => r.id === roleId))
            }
            onClick={submit}
          >
            {t(
              pending
                ? "savingMember"
                : mode === "remove"
                  ? "confirmRemove"
                  : "saveRole",
            )}
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
