import React from "react";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppLocaleProvider } from "@/i18n/provider";
import { useAuthStore } from "@/store/auth-store";
import { PatientReport } from "./PatientReport";
const fake = vi.hoisted(() => ({
  error: false,
  summary: JSON.stringify({
    format: "omnix.patient-summary.v1",
    facts: {
      treatmentInterest: "Crowns",
      travelWindow: "November",
      photoSent: true,
      mood: "anxious",
    },
    summary: "Synthetic patient enquiry",
    handoffSummary: "Staff to confirm payment",
  }),
  fetch: vi.fn(),
}));
vi.mock("@/lib/api/generated/conversations/conversations", () => ({
  useConversationsControllerGetConversation: () => ({
    isPending: false,
    isError: fake.error,
    isFetching: false,
    error: new Error("Synthetic denied"),
    refetch: vi.fn(),
    data: {
      lead: {
        firstName: "Synthetic",
        lastName: "Patient",
        country: "UK",
        summary: fake.summary,
      },
    },
  }),
}));
vi.mock("./hooks", () => ({
  useThreadHistory: () => ({
    isPending: false,
    isError: false,
    isFetching: false,
    hasNextPage: true,
    fetchNextPage: fake.fetch,
    data: {
      pages: [
        {
          data: [
            {
              id: "m1",
              type: "USER_TEXT",
              content: "Synthetic staff reply",
              status: "SENT",
              createdAt: "2026-10-07T12:00:00Z",
              updatedAt: "2026-10-07T12:00:00Z",
            },
          ],
        },
      ],
    },
  }),
}));
vi.stubGlobal("React", React);
beforeEach(() => {
  fake.error = false;
  useAuthStore
    .getState()
    .setAuth("synthetic", {
      id: "staff",
      organizationId: "org",
      hasCompletedOnboarding: true,
      locale: "EN",
      firstName: "Synthetic",
    });
  vi.spyOn(window, "print").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("shows facts, summary, handoff and events and calls browser print", () => {
  render(
    <AppLocaleProvider>
      <PatientReport id="synthetic-conversation" />
    </AppLocaleProvider>,
  );
  for (const text of [
    "Crowns",
    "November",
    "Anxious",
    "Staff to confirm payment",
    "Synthetic staff reply",
  ])
    expect(screen.getByText(text)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Print / Save as PDF" }));
  expect(window.print).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Load earlier events" }));
  expect(fake.fetch).toHaveBeenCalled();
});
it("does not render patient information when detail access fails", () => {
  fake.error = true;
  render(
    <AppLocaleProvider>
      <PatientReport id="synthetic-conversation" />
    </AppLocaleProvider>,
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
  expect(screen.queryByText("Crowns")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Print / Save as PDF" }),
  ).not.toBeInTheDocument();
});
