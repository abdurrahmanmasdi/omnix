import React from "react";
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppLocaleProvider } from "@/i18n/provider";
import { useAuthStore } from "@/store/auth-store";
import { Sidebar } from "@/components/layout/Sidebar";
import TeamPage from "./page";
const fake = vi.hoisted(() => ({
  allowed: true,
  members: {
    data: [
      {
        id: "member",
        userId: "self",
        firstName: "Synthetic",
        lastName: "Owner",
        email: "owner@example.invalid",
        roleId: "owner-role",
        roleName: "Super Admin",
        status: "ACTIVE",
        joinedAt: "2030-01-01T12:00:00Z",
      },
    ],
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  invitations: {
    data: [
      {
        id: "invite",
        email: "staff@example.invalid",
        roleName: "Agent",
        issuer: "Synthetic Owner",
        expiresAt: "2030-01-08T12:00:00Z",
      },
    ],
    isLoading: false,
    isError: false,
    error: undefined as unknown,
    refetch: vi.fn(),
  },
  roles: {
    data: [{ id: "agent", name: "Agent" }],
    isLoading: false,
    isError: false,
  },
  issue: vi.fn(),
  revoke: vi.fn(),
  copy: vi.fn(),
}));
vi.mock("@/lib/api/generated/users/users", () => ({
  useUserProfileControllerGet: () => ({
    data: {
      memberships: [{ organizationId: "org", canManageTeam: fake.allowed }],
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/lib/api/generated/clinic-team/clinic-team", () => ({
  useClinicTeamControllerMembers: () => fake.members,
  useClinicTeamControllerInvitations: () => fake.invitations,
  useClinicTeamControllerRoles: () => fake.roles,
  useClinicTeamControllerRevoke: () => ({
    mutateAsync: fake.revoke,
    isPending: false,
  }),
  getClinicTeamControllerInvitationsQueryKey: () => [
    "/organizations/current/invitations",
  ],
}));
vi.mock("@/lib/api/generated/authentication/authentication", () => ({
  useInvitationsControllerIssueClinic: () => ({
    mutateAsync: fake.issue,
    isPending: false,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/settings/team",
}));
vi.stubGlobal("React", React);
const originalMembers = [...fake.members.data],
  originalInvitations = [...fake.invitations.data];
beforeEach(() => {
  fake.allowed = true;
  fake.members.data = [...originalMembers];
  fake.members.isLoading = false;
  fake.members.isError = false;
  fake.invitations.data = [...originalInvitations];
  fake.invitations.isError = false;
  fake.roles.data = [{ id: "agent", name: "Agent" }];
  fake.issue.mockReset().mockResolvedValue({
    invitationId: "new",
    token: "a".repeat(64),
    expiresAt: "2030-01-08T12:00:00Z",
    createsAccount: true,
  });
  fake.revoke.mockReset().mockResolvedValue({ revoked: true });
  fake.copy.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: fake.copy },
  });
  useAuthStore.getState().setAuth("synthetic-access", {
    id: "self",
    organizationId: "org",
    hasCompletedOnboarding: true,
    locale: "EN",
    firstName: "Synthetic",
  });
});
afterEach(cleanup);
function show(child = <TeamPage />) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider initialLocale="en">{child}</AppLocaleProvider>
    </QueryClientProvider>,
  );
}
function invite() {
  fireEvent.click(screen.getByRole("button", { name: "Invite staff" }));
}
function fillInvitation() {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "new@example.invalid" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Role" }), {
    target: { value: "agent" },
  });
}
it("renders clinic members and pending invitations with issuer", () => {
  show();
  expect(screen.getAllByRole("table")).toHaveLength(2);
  expect(screen.getAllByText("Synthetic Owner")).toHaveLength(2);
  expect(screen.getByText("Active")).toBeInTheDocument();
  expect(screen.getByText("staff@example.invalid")).toBeInTheDocument();
});
it("renders empty tables explicitly", () => {
  fake.members.data = [];
  fake.invitations.data = [];
  show();
  expect(screen.getByText("No members found.")).toBeInTheDocument();
  expect(screen.getByText("No pending invitations.")).toBeInTheDocument();
});
it("fails closed for missing team permission", () => {
  fake.allowed = false;
  show();
  expect(screen.getByRole("alert")).toHaveTextContent("do not have permission");
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("hides Sidebar team link without permission and shows it with permission", () => {
  fake.allowed = false;
  const view = show(<Sidebar />);
  expect(
    screen.queryByRole("link", { name: "Clinic team" }),
  ).not.toBeInTheDocument();
  view.unmount();
  fake.allowed = true;
  show(<Sidebar />);
  expect(screen.getByRole("link", { name: "Clinic team" })).toHaveAttribute(
    "href",
    "/dashboard/settings/team",
  );
});
it("distinguishes loading and failed members from empty state", () => {
  fake.members.isLoading = true;
  const view = show();
  expect(screen.getByRole("status")).toHaveTextContent("Loading team");
  view.unmount();
  fake.members.isLoading = false;
  fake.members.isError = true;
  fake.members.error = new Error("synthetic network failure");
  show();
  expect(screen.getByRole("alert")).toHaveTextContent("could not be loaded");
  expect(screen.queryByText("No members found.")).not.toBeInTheDocument();
});
it("offers only grantable roles and shows a copyable fragment link and expiry", async () => {
  show();
  invite();
  fillInvitation();
  expect(
    screen.queryByRole("option", { name: "Manager" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  const link = await screen.findByLabelText("Invitation link");
  expect(link).toHaveValue(
    `${window.location.origin}/accept-invitation#type=clinic&token=${"a".repeat(64)}`,
  );
  expect(fake.issue).toHaveBeenCalledWith({
    data: { email: "new@example.invalid", roleId: "agent" },
  });
  expect(screen.getByText(/No email is sent/)).toBeInTheDocument();
  expect(screen.getByText(/Expires:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Link copied");
  expect(fake.copy).toHaveBeenCalledWith((link as HTMLInputElement).value);
});
it("shows invitation creation failure", async () => {
  fake.issue.mockRejectedValueOnce(new Error("network"));
  show();
  invite();
  fillInvitation();
  fireEvent.click(screen.getByRole("button", { name: "Create invitation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "could not be completed",
  );
  expect(screen.queryByLabelText("Invitation link")).not.toBeInTheDocument();
});
it("requires confirmation before revocation", async () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByText(/staff@example.invalid/)).toBeInTheDocument();
  expect(fake.revoke).not.toHaveBeenCalled();
  fireEvent.click(
    within(dialog).getByRole("button", { name: "Confirm revocation" }),
  );
  await waitFor(() =>
    expect(fake.revoke).toHaveBeenCalledWith({ id: "invite" }),
  );
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Invitation revoked",
  );
});
it("retains confirmation error if revocation fails", async () => {
  fake.revoke.mockRejectedValueOnce({
    response: { data: { code: "CLINIC_INVITATION_NOT_PENDING" } },
  });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Revoke invitation" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm revocation" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "no longer pending",
  );
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("disables invitations when no role may be granted", () => {
  fake.roles.data = [];
  show();
  expect(screen.getByRole("button", { name: "Invite staff" })).toBeDisabled();
  expect(screen.getByText(/No roles can be granted/)).toBeInTheDocument();
});
