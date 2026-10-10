import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import { vi, it, expect, afterEach } from "vitest";
import { Sidebar } from "@/components/layout/Sidebar";
import { messages } from "@/i18n/messages";
import { useAuthStore } from "@/store/auth-store";
const fetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/axios-client", () => ({ customFetch: fetch }));
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children }: any) => <a href={href}>{children}</a>,
}));
let client: QueryClient;
afterEach(() => {
  cleanup();
  client?.clear();
});
it.each([true, false])(
  "shows Reports only after its all-grants access probe: %s",
  async (allowed) => {
    useAuthStore.setState({
      user: {
        id: "user-a",
        organizationId: "clinic-a",
        hasCompletedOnboarding: true,
      },
    });
    fetch.mockImplementation(async (config: any) => {
      if (config.url === "/users/me") return { memberships: [] };
      if (!allowed) throw new Error("403");
      return { allowed: true };
    });
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={messages.en}>
          <Sidebar />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
    if (allowed)
      expect(
        await screen.findByRole("link", { name: "Reports" }),
      ).toHaveAttribute("href", "/dashboard/reports/weekly");
    else {
      await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
      expect(
        screen.queryByRole("link", { name: "Reports" }),
      ).not.toBeInTheDocument();
    }
  },
);
