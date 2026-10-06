import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppLocaleProvider } from "@/i18n/provider";
import { useAuthStore } from "@/store/auth-store";
import { MemberActions } from "./MemberActions";
const state = vi.hoisted(() => ({
  change: vi.fn(),
  remove: vi.fn(),
  changed: vi.fn(),
}));
vi.mock("@/lib/api/generated/clinic-team/clinic-team", () => ({
  useClinicTeamControllerChangeRole: () => ({
    mutateAsync: state.change,
    isPending: false,
  }),
  useClinicTeamControllerRemoveMember: () => ({
    mutateAsync: state.remove,
    isPending: false,
  }),
  getClinicTeamControllerMembersQueryKey: () => [
    "/organizations/current/members",
  ],
}));
vi.stubGlobal("React", React);
const member = {
  id: "membership",
  userId: "other",
  firstName: "Synthetic",
  lastName: "Member",
  email: "member@example.invalid",
  roleId: "manager",
  roleName: "Manager",
  status: "ACTIVE",
  joinedAt: "2030-01-01T12:00:00Z",
};
const roles = [
  { id: "agent", name: "Agent" },
  { id: "owner", name: "Super Admin" },
];
beforeEach(() => {
  state.change.mockReset().mockResolvedValue({ changed: true });
  state.remove.mockReset().mockResolvedValue({ changed: true });
  state.changed.mockReset();
  useAuthStore.getState().setAuth("synthetic", {
    id: "self",
    organizationId: "org",
    hasCompletedOnboarding: true,
    locale: "EN",
  });
});
afterEach(cleanup);
function show(own = false, allowed = true, available = roles) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider initialLocale="en">
        <MemberActions
          member={{ ...member, userId: own ? "self" : "other" }}
          roles={available}
          allowed={allowed}
          onChanged={state.changed}
        />
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
it("hides actions for own row", () => {
  show(true);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("hides actions without permission", () => {
  show(false, false);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("submits only the selected grantable role and notifies the table", async () => {
  show();
  click("Change role");
  expect(screen.getByRole("button", { name: "Save role" })).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Role"), {
    target: { value: "agent" },
  });
  click("Save role");
  await waitFor(() =>
    expect(state.change).toHaveBeenCalledWith({
      membershipId: "membership",
      data: { roleId: "agent" },
    }),
  );
  expect(state.changed).toHaveBeenCalledWith("role");
});
it("can select an owner role when returned as grantable", async () => {
  show();
  click("Change role");
  fireEvent.change(screen.getByLabelText("Role"), {
    target: { value: "owner" },
  });
  click("Save role");
  await waitFor(() =>
    expect(state.change).toHaveBeenCalledWith({
      membershipId: "membership",
      data: { roleId: "owner" },
    }),
  );
});
it("disables role changes if no grantable roles are available", () => {
  show(false, true, []);
  expect(screen.getByRole("button", { name: "Change role" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Remove" })).toBeEnabled();
});
it("requires confirmation before removal", async () => {
  show();
  click("Remove");
  expect(state.remove).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "member@example.invalid",
  );
  click("Confirm removal");
  await waitFor(() =>
    expect(state.remove).toHaveBeenCalledWith({ membershipId: "membership" }),
  );
  expect(state.changed).toHaveBeenCalledWith("remove");
});
it("cancel does not remove", () => {
  show();
  click("Remove");
  click("Cancel");
  expect(state.remove).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
it("retains coded last-owner refusal on role change", async () => {
  state.change.mockRejectedValue({
    response: { data: { code: "TEAM_LAST_OWNER_REQUIRED" } },
  });
  show();
  click("Change role");
  fireEvent.change(screen.getByLabelText("Role"), {
    target: { value: "agent" },
  });
  click("Save role");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "at least one active owner",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(state.changed).not.toHaveBeenCalled();
});
it("retains coded self/member errors on removal", async () => {
  state.remove.mockRejectedValue({
    response: { data: { code: "TEAM_SELF_CHANGE_FORBIDDEN" } },
  });
  show();
  click("Remove");
  click("Confirm removal");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "cannot change your own role",
  );
  expect(state.changed).not.toHaveBeenCalled();
});
