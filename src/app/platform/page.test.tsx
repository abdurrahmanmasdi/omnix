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
import { Header } from "@/components/layout/Header";
import PlatformPage from "./page";
const state = vi.hoisted(() => ({
  allowed: true,
  loading: false,
  authFailed: false,
  clinicFailed: false,
  tableLoading: false,
  empty: false,
  invite: vi.fn(),
  recovery: vi.fn(),
  revoke: vi.fn(),
  copy: vi.fn(),
  navigate: vi.fn(),
  enabled: [] as boolean[],
  clinics: [
    {
      id: "clinic",
      name: "Synthetic Clinic",
      isActive: true,
      memberCount: 3,
      ownerEmails: ["owner@example.invalid"],
      createdAt: "2030-01-01T12:00:00Z",
    },
  ],
  invitations: [
    {
      id: "invite",
      email: "pending@example.invalid",
      issuer: "Synthetic admin",
      expiresAt: "2030-01-08T12:00:00Z",
    },
  ],
}));
vi.mock("@/lib/api/generated/authentication/authentication", () => ({
  useAuthControllerGetProfile: () => ({
    data: { user: { isPlatformAdmin: state.allowed } },
    isError: state.authFailed,
    isLoading: state.loading,
    error: {},
    refetch: vi.fn(),
  }),
}));
vi.mock("@/lib/api/generated/users/users", () => ({
  useUserProfileControllerGet: () => ({ data: { memberships: [] } }),
  useUserLocaleControllerUpdateLocale: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));
vi.mock("@/lib/api/generated/platform/platform", () => ({
  usePlatformControllerClinics: (options: { query: { enabled: boolean } }) => {
    state.enabled.push(options.query.enabled);
    return {
      data: state.empty ? [] : state.clinics,
      isError: state.clinicFailed,
      isLoading: state.tableLoading,
      error: {},
      refetch: vi.fn(),
    };
  },
  usePlatformControllerInvitations: (options: {
    query: { enabled: boolean };
  }) => {
    state.enabled.push(options.query.enabled);
    return {
      data: state.empty ? [] : state.invitations,
      isError: false,
      isLoading: state.tableLoading,
      refetch: vi.fn(),
    };
  },
  usePlatformControllerInvite: () => ({
    mutateAsync: state.invite,
    isPending: false,
  }),
  usePlatformControllerRecovery: () => ({
    mutateAsync: state.recovery,
    isPending: false,
  }),
  usePlatformControllerRevoke: () => ({
    mutateAsync: state.revoke,
    isPending: false,
  }),
  getPlatformControllerInvitationsQueryKey: () => ["/platform/invitations"],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: state.navigate }),
}));
vi.mock("@/components/layout/NotificationBell", () => ({
  NotificationBell: () => null,
}));
vi.stubGlobal("React", React);
beforeEach(() => {
  state.allowed = true;
  state.loading = false;
  state.authFailed = false;
  state.clinicFailed = false;
  state.tableLoading = false;
  state.empty = false;
  state.enabled = [];
  state.invite.mockReset().mockResolvedValue({
    invitationId: "issued",
    link: "https://app.example.invalid/accept-invitation#token=synthetic",
    expiresAt: "2030-01-08T12:00:00Z",
  });
  state.recovery.mockReset().mockResolvedValue({
    invitationId: "recovery",
    link: "https://app.example.invalid/recover#token=synthetic",
    expiresAt: "2030-01-08T12:00:00Z",
  });
  state.revoke.mockReset().mockResolvedValue({ revoked: true });
  state.copy.mockReset().mockResolvedValue(undefined);
  state.navigate.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: state.copy },
  });
  useAuthStore.getState().setAuth("synthetic", {
    id: "self",
    organizationId: null,
    hasCompletedOnboarding: false,
    locale: "EN",
  });
});
afterEach(cleanup);
function show(child = <PlatformPage />) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider initialLocale="en">{child}</AppLocaleProvider>
    </QueryClientProvider>,
  );
}
function open(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
function fillEmail(email = "new@example.invalid") {
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: email },
  });
}
it("shows clinic metadata and owner invitations for an account-only admin", () => {
  show();
  expect(screen.getByText("Synthetic Clinic")).toBeInTheDocument();
  expect(screen.getByText("owner@example.invalid")).toBeInTheDocument();
  expect(screen.getByText("pending@example.invalid")).toBeInTheDocument();
  expect(screen.getAllByRole("table")).toHaveLength(2);
});
it("hides controls and disables platform reads for non-admins", () => {
  state.allowed = false;
  show();
  expect(screen.getByText("Page not found")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(state.enabled.every((v) => !v)).toBe(true);
});
it("distinguishes loading, empty and failed clinic states", () => {
  state.tableLoading = true;
  show();
  expect(screen.getAllByRole("status")).toHaveLength(2);
  cleanup();
  state.tableLoading = false;
  state.empty = true;
  show();
  expect(screen.getByText("No clinics yet.")).toBeInTheDocument();
  expect(screen.getByText("No pending owner invitations.")).toBeInTheDocument();
  cleanup();
  state.empty = false;
  state.clinicFailed = true;
  show();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not load platform data.",
  );
  expect(screen.queryByText("No clinics yet.")).not.toBeInTheDocument();
});
it("shows self loading and failure without privileged controls", () => {
  state.loading = true;
  show();
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  cleanup();
  state.loading = false;
  state.authFailed = true;
  show();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Could not load platform data.",
  );
  expect(
    screen.queryByRole("button", { name: "Invite clinic owner" }),
  ).not.toBeInTheDocument();
});
it("generates owner link, displays expiry and copies it", async () => {
  show();
  open("Invite clinic owner");
  fillEmail();
  open("Generate link");
  await screen.findByLabelText("Invitation or recovery link");
  expect(state.invite).toHaveBeenCalledWith({
    data: { email: "new@example.invalid" },
  });
  expect(screen.getByLabelText("Invitation or recovery link")).toHaveValue(
    "https://app.example.invalid/accept-invitation#token=synthetic",
  );
  expect(screen.getByRole("dialog")).toHaveTextContent("Jan 8, 2030");
  open("Copy link");
  await waitFor(() =>
    expect(state.copy).toHaveBeenCalledWith(
      "https://app.example.invalid/accept-invitation#token=synthetic",
    ),
  );
  expect(await screen.findByText("Copied")).toBeInTheDocument();
});
it("clears issued links when closing and generates recovery separately", async () => {
  show();
  open("Invite clinic owner");
  fillEmail();
  open("Generate link");
  await screen.findByLabelText("Invitation or recovery link");
  fireEvent.click(screen.getByTestId("platform-link-close"));
  open("Recovery link");
  expect(
    screen.queryByLabelText("Invitation or recovery link"),
  ).not.toBeInTheDocument();
  fillEmail("active@example.invalid");
  open("Generate link");
  expect(
    await screen.findByLabelText("Invitation or recovery link"),
  ).toHaveValue("https://app.example.invalid/recover#token=synthetic");
  expect(state.recovery).toHaveBeenCalledWith({
    data: { email: "active@example.invalid" },
  });
});
it("retains issuance failure and maps a recovery domain error", async () => {
  state.recovery.mockRejectedValue({
    response: { data: { code: "RECOVERY_ACCOUNT_UNAVAILABLE" } },
  });
  show();
  open("Recovery link");
  fillEmail();
  open("Generate link");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "An active account is required for recovery.",
  );
  expect(
    screen.queryByLabelText("Invitation or recovery link"),
  ).not.toBeInTheDocument();
});
it("supports manual copy fallback", async () => {
  state.copy.mockRejectedValue(new Error("blocked"));
  show();
  open("Invite clinic owner");
  fillEmail();
  open("Generate link");
  await screen.findByLabelText("Invitation or recovery link");
  open("Copy link");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "copy it manually",
  );
});
it("requires revoke confirmation before mutation", async () => {
  show();
  open("Revoke");
  expect(state.revoke).not.toHaveBeenCalled();
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Revoke",
    }),
  );
  await waitFor(() =>
    expect(state.revoke).toHaveBeenCalledWith({ id: "invite" }),
  );
  expect(await screen.findByText("Invitation revoked.")).toBeInTheDocument();
});
it("retains revoke dialog after failure", async () => {
  state.revoke.mockRejectedValue(new Error("failed"));
  show();
  open("Revoke");
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Revoke",
    }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "The action failed.",
  );
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});
it("shows Header platform entry only when self response grants access", async () => {
  show(<Header onLogout={vi.fn()} onMenu={vi.fn()} menuOpen={false} />);
  fireEvent.pointerDown(screen.getByTestId("user-menu"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "Platform administration" }),
  );
  expect(state.navigate).toHaveBeenCalledWith("/platform");
  cleanup();
  state.allowed = false;
  show(<Header onLogout={vi.fn()} onMenu={vi.fn()} menuOpen={false} />);
  fireEvent.pointerDown(screen.getByTestId("user-menu"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  await screen.findByRole("menuitem", { name: "Profile" });
  expect(
    screen.queryByRole("menuitem", { name: "Platform administration" }),
  ).not.toBeInTheDocument();
});
