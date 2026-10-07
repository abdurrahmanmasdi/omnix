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
import type { ClinicFactSheetDto } from "@/lib/api/model";
import ClinicFactsPage from "./page";
const fake = vi.hoisted(() => ({
  data: { latest: null, approved: null } as ClinicFactSheetDto,
  pending: false,
  error: false,
  save: vi.fn(),
  approve: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/lib/api/generated/clinic-facts/clinic-facts", () => ({
  useClinicFactsControllerRead: () => ({
    data: fake.data,
    isPending: fake.pending,
    isError: fake.error,
    error: new Error("Synthetic failure"),
    refetch: fake.refetch,
  }),
  useClinicFactsControllerSave: () => ({
    mutateAsync: fake.save,
    isPending: false,
  }),
  useClinicFactsControllerApprove: () => ({
    mutateAsync: fake.approve,
    isPending: false,
  }),
  getClinicFactsControllerReadQueryKey: () => ["clinic-facts"],
}));
vi.stubGlobal("React", React);
beforeEach(() => {
  fake.data = { latest: null, approved: null };
  fake.pending = false;
  fake.error = false;
  fake.save.mockReset().mockResolvedValue({});
  fake.approve.mockReset().mockResolvedValue({});
  useAuthStore
    .getState()
    .setAuth("synthetic", {
      id: "owner",
      organizationId: "org",
      hasCompletedOnboarding: true,
      locale: "EN",
      firstName: "Synthetic",
    });
});
afterEach(cleanup);
function tree() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AppLocaleProvider>
        <ClinicFactsPage />
      </AppLocaleProvider>
    </QueryClientProvider>
  );
}

it.each(["EN", "TR", "AR"] as const)(
  "renders translated facts page in %s",
  (locale) => {
    useAuthStore
      .getState()
      .setAuth("synthetic", {
        id: "owner",
        organizationId: "org",
        hasCompletedOnboarding: true,
        locale,
        firstName: "Synthetic",
      });
    render(tree());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      { EN: "Clinic facts", TR: "Klinik bilgileri", AR: "معلومات العيادة" }[
        locale
      ],
    );
  },
);
it("saves a structured draft and prevents approval of unsaved edits", async () => {
  render(tree());
  const approve = screen.getByRole("button", { name: "Approve saved version" });
  expect(approve).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Location"), {
    target: { value: "Synthetic Istanbul clinic" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add treatment" }));
  fireEvent.change(screen.getByLabelText("Name"), {
    target: { value: "Crowns" },
  });
  fireEvent.change(screen.getByLabelText("Minimum price"), {
    target: { value: "220" },
  });
  fireEvent.change(screen.getByLabelText("Maximum price"), {
    target: { value: "320" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(fake.save).toHaveBeenCalledOnce());
  expect(fake.save.mock.calls[0][0].data).toMatchObject({
    expectedVersion: 0,
    facts: {
      location: "Synthetic Istanbul clinic",
      treatments: [
        { name: "Crowns", priceMin: 220, priceMax: 320, currency: "EUR" },
      ],
    },
  });
  expect(fake.approve).not.toHaveBeenCalled();
});
it("approves exactly the saved version and shows the approved revision separately", async () => {
  const facts = {
    treatments: [],
    doctors: [],
    offers: [],
    warranty: "",
    process: "",
    days: "",
    location: "Draft location",
    paymentMethods: [],
    languages: [],
  };
  fake.data = {
    latest: { version: 2, facts, approvedAt: null, approvedBy: null },
    approved: {
      version: 1,
      facts: { ...facts, location: "Approved location" },
      approvedAt: "2026-10-07T12:00:00Z",
      approvedBy: "owner",
    },
  };
  render(tree());
  expect(screen.getByLabelText("Location")).toHaveValue("Draft location");
  expect(screen.getByText(/Approved version 1/)).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "Approve saved version" }),
  );
  await waitFor(() =>
    expect(fake.approve).toHaveBeenCalledWith({ data: { version: 2 } }),
  );
  fireEvent.change(screen.getByLabelText("Location"), {
    target: { value: "Unsaved change" },
  });
  expect(
    screen.getByRole("button", { name: "Approve saved version" }),
  ).toBeDisabled();
});
it("renders read errors and retry without editable facts", () => {
  fake.error = true;
  render(tree());
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Save draft" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(fake.refetch).toHaveBeenCalled();
});
it("shows loading and mutation errors", async () => {
  fake.pending = true;
  const view = render(tree());
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  fake.pending = false;
  view.rerender(tree());
  fake.save.mockRejectedValue(new Error("Synthetic conflict"));
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
});
