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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppLocaleProvider } from "@/i18n/provider";
import { useAuthStore } from "@/store/auth-store";
import ProfilePage from "./page";
import { Header } from "@/components/layout/Header";

const state = vi.hoisted(() => ({
  profile: {
    id: "self",
    email: "staff@example.invalid",
    firstName: "Synthetic",
    lastName: "Staff",
    phoneNumber: null,
    whatsappNumber: null,
    spokenLanguages: ["English"],
    locale: "EN",
    memberships: [
      {
        organizationId: "org",
        organizationName: "Synthetic clinic",
        roleName: "Clinic owner",
        status: "ACTIVE",
      },
    ],
  },
  update: vi.fn(),
  password: vi.fn(),
  refetch: vi.fn(),
  failed: false,
  navigate: vi.fn(),
}));
vi.mock("@/lib/api/generated/users/users", () => ({
  useUserProfileControllerGet: () => ({
    data: state.failed ? undefined : state.profile,
    isLoading: false,
    error: new Error("Synthetic failure"),
    refetch: state.refetch,
  }),
  useUserProfileControllerUpdate: () => ({
    mutateAsync: state.update,
    isPending: false,
  }),
  useUserProfileControllerPassword: () => ({
    mutateAsync: state.password,
    isPending: false,
  }),
  useUserLocaleControllerUpdateLocale: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  getUserProfileControllerGetQueryKey: () => ["/users/me"],
}));
vi.mock("@/lib/api/generated/authentication/authentication", () => ({
  useAuthControllerGetProfile: () => ({
    data: { user: { isPlatformAdmin: false } },
    isError: false,
  }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/profile",
  useRouter: () => ({ push: state.navigate }),
}));
vi.mock("@/components/layout/NotificationBell", () => ({
  NotificationBell: () => null,
}));
vi.stubGlobal("React", React);
beforeEach(() => {
  state.failed = false;
  state.update
    .mockReset()
    .mockResolvedValue({ ...state.profile, firstName: "Updated" });
  state.password.mockReset().mockResolvedValue({ access_token: "renewed" });
  useAuthStore.getState().setAuth("original", {
    id: "self",
    firstName: "Synthetic",
    lastName: "Staff",
    locale: "EN",
    organizationId: "org",
    hasCompletedOnboarding: true,
  });
});
afterEach(cleanup);
function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider initialLocale="en">
        <ProfilePage />
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
}
function set(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
it("renders read-only email and real clinic membership", () => {
  show();
  expect(screen.getByLabelText("Email (read-only)")).toHaveAttribute(
    "readonly",
  );
  expect(screen.getByText("Clinic owner · Active")).toBeInTheDocument();
});
it("rejects invalid phone before mutation", async () => {
  show();
  set("Phone number", "bad");
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("E.164");
  expect(state.update).not.toHaveBeenCalled();
});
it("saves profile and updates same-session name", async () => {
  show();
  set("First name", "Updated");
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("status")).toHaveTextContent("Profile saved");
  expect(state.update).toHaveBeenCalledWith({
    data: expect.objectContaining({
      firstName: "Updated",
      spokenLanguages: ["English"],
      phoneNumber: "",
    }),
  });
  expect(useAuthStore.getState().user?.firstName).toBe("Updated");
  expect(useAuthStore.getState().accessToken).toBe("original");
});
it("shows save failure", async () => {
  state.update.mockRejectedValueOnce(new Error("network"));
  show();
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Changes could not be saved",
  );
});
it("checks password confirmation and UTF-8 size", async () => {
  show();
  set("Current password", "current");
  set("New password", "SyntheticNewPassword123");
  set("Confirm new password", "different");
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("do not match");
  set("New password", "ع".repeat(37));
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("72 UTF-8 bytes");
  expect(state.password).not.toHaveBeenCalled();
});
it("renews current access token and clears password fields", async () => {
  show();
  set("Current password", "current");
  set("New password", "SyntheticNewPassword123");
  set("Confirm new password", "SyntheticNewPassword123");
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("status")).toHaveTextContent(
    "Password updated",
  );
  expect(useAuthStore.getState().accessToken).toBe("renewed");
  expect(screen.getByLabelText("Current password")).toHaveValue("");
});
it("translates wrong current password code without clearing session", async () => {
  state.password.mockRejectedValueOnce({
    response: {
      data: { code: "CURRENT_PASSWORD_INVALID", message: "stored fallback" },
    },
  });
  show();
  set("Current password", "wrong");
  set("New password", "SyntheticNewPassword123");
  set("Confirm new password", "SyntheticNewPassword123");
  fireEvent.click(screen.getByRole("button", { name: "Update password" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Current password is incorrect",
  );
  expect(useAuthStore.getState().accessToken).toBe("original");
});
it("renders query failure with retry", async () => {
  state.failed = true;
  show();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Profile could not be loaded",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(state.refetch).toHaveBeenCalled());
});

it("Header shows real role and opens Profile", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider initialLocale="en">
        <Header onLogout={vi.fn()} onMenu={vi.fn()} menuOpen={false} />
      </AppLocaleProvider>
    </QueryClientProvider>,
  );
  fireEvent.pointerDown(screen.getByTestId("user-menu"), {
    button: 0,
    ctrlKey: false,
    pointerType: "mouse",
  });
  expect(await screen.findByText("Clinic owner")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
  expect(state.navigate).toHaveBeenCalledWith("/dashboard/profile");
});
