import { NextIntlClientProvider } from "next-intl";
import { messages } from "@/i18n/messages";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import AcceptInvitationPage from "./page";
import SignupPage from "../signup/page";

vi.mock("axios", () => ({ default: { post: vi.fn() } }));
const authState = vi.hoisted(() => ({
  accessToken: null as string | null,
  user: null as { firstName: string } | null,
}));
vi.mock("@/store/auth-store", () => ({ useAuthStore: () => authState }));
const token = "a".repeat(64);
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  authState.accessToken = null;
  authState.user = null;
  window.history.replaceState(null, "", `/accept-invitation#token=${token}`);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function submit() {
  for (const [name, value] of Object.entries({
    firstName: "Synthetic",
    lastName: "Founder",
    password: "Synthetic-password-123",
  })) {
    container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value =
      value;
  }
  await act(async () => {
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("pilot invitation UI", () => {
  it("renders clinic acceptance for an existing user after reading the fragment", async () => {
    authState.accessToken = "synthetic-access-token";
    authState.user = { firstName: "Synthetic" };
    window.history.replaceState(
      null,
      "",
      `/accept-invitation#token=${token}&type=clinic`,
    );
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <AcceptInvitationPage />
        </NextIntlClientProvider>,
      ),
    );
    expect(window.location.hash).toBe("");
    expect(container.textContent).toContain("Accept Clinic Invitation");
    expect(container.textContent).toContain("You are logged in as Synthetic");
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("button")?.textContent).toBe(
      "Accept invitation",
    );
  });

  it("removes the capability from browser history and activates without session cookies", async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: { message: "Account activated" },
    });
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <AcceptInvitationPage />
        </NextIntlClientProvider>,
      ),
    );
    expect(window.location.hash).toBe("");
    await submit();
    expect(container.textContent).toContain("Account activated");
    expect(axios.post).toHaveBeenCalledWith(
      expect.stringContaining("/auth/accept-invitation"),
      {
        token,
        password: "Synthetic-password-123",
        firstName: "Synthetic",
        lastName: "Founder",
      },
      { withCredentials: false },
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/login");
  });

  it("does not send an activation request without an invitation", async () => {
    window.history.replaceState(null, "", "/accept-invitation");
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <AcceptInvitationPage />
        </NextIntlClientProvider>,
      ),
    );
    await submit();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(axios.post).not.toHaveBeenCalled();
  });

  it("shows a recovery message for an invalid invitation without reporting success", async () => {
    vi.mocked(axios.post).mockRejectedValue({ response: { status: 401 } });
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <AcceptInvitationPage />
        </NextIntlClientProvider>,
      ),
    );
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Activation could not be completed",
    );
    expect(container.textContent).not.toContain("Account activated");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("replaces public registration with pilot access information", async () => {
    await act(async () =>
      root.render(
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <SignupPage />
        </NextIntlClientProvider>,
      ),
    );
    expect(container.textContent).toContain(
      "Public signup is not available yet.",
    );
    expect(container.querySelector("input")).toBeNull();
  });
});
