import { test, expect } from "@playwright/test";
import { weeklyFixture } from "../../src/features/reports/weekly.fixture";
import { messages } from "../../src/i18n/messages";
// This focused spec needs the clean temporary feature harness described in the REP-1 log.
// It does not sign in, use a database or contact providers.
const harness = process.env.REP1_QA_URL;
test.skip(!harness, "REP1_QA_URL must point to the synthetic feature harness");
for (const locale of ["en", "tr", "ar"] as const) {
  test(`weekly report ${locale}: desktop, narrow, week, errors and printable PDF`, async ({
    page,
  }) => {
    let failure = false;
    let empty = false;
    await page.route(`${harness}/api/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith("/users/me"))
        return route.fulfill({
          json: {
            memberships: [
              {
                organizationId: "clinic-a",
                organizationName: "Synthetic Dental Clinic",
                status: "ACTIVE",
              },
            ],
          },
        });
      if (failure)
        return route.fulfill({
          status: 422,
          json: { code: "WEEKLY_REPORT_TOO_LARGE" },
        });
      const report = weeklyFixture(
        url.searchParams.get("weekStart") ?? undefined,
      );
      if (empty) return route.fulfill({ json: report });
      report.newLeads = 3;
      report.activeConversations = 3;
      report.patientMessages = 4;
      report.activity = {
        aiReplies: 2,
        staffDashboardReplies: 1,
        staffPhoneMessages: 1,
        denominator: 4,
        aiPercent: 50,
        staffPercent: 50,
      };
      report.replyInterval = {
        opportunities: 3,
        replied: 2,
        pending: 1,
        medianSeconds: 210,
        p90Seconds: 300,
        ai: { replied: 1, medianSeconds: 300 },
        staff: { replied: 1, medianSeconds: 120 },
      };
      report.handedToTeamConversations = 1;
      report.topics = [
        { id: "price", conversations: 2 },
        { id: "implants", conversations: 2 },
        { id: "consultation", conversations: 1 },
      ];
      report.coverage = {
        legacyOriginMessages: 4,
        unresolvedHandoffReferences: 0,
        topicClassifiedConversations: 3,
        topicUnclassifiedConversations: 0,
        excludedPhoneMessages: 1,
      };
      return route.fulfill({ json: report });
    });
    await page.goto(`${harness}/?locale=${locale}`);
    const t = messages[locale].WeeklyReport;
    const print = page.getByRole("button", { name: t.print, exact: true });
    await expect(print).toBeEnabled();
    await expect(page.getByText(t.notTracked, { exact: true })).toBeVisible();
    await expect(page.locator("#weekly-report")).toHaveAttribute(
      "dir",
      locale === "ar" ? "rtl" : "ltr",
    );
    await page.screenshot({
      path: `/tmp/rep1-browser-qa/${locale}-desktop.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `/tmp/rep1-browser-qa/${locale}-narrow.png`,
      fullPage: true,
    });
    await page.getByRole("button", { name: t.next, exact: true }).click();
    await expect(page.getByText(t.inProgress, { exact: true })).toBeVisible();
    failure = true;
    await page.getByRole("button", { name: t.refresh, exact: true }).click();
    await expect(page.getByText(t.tooLarge, { exact: true })).toBeVisible();
    await expect(print).toBeDisabled();
    await expect(page.getByText(t.newLeads, { exact: true })).toHaveCount(0);
    failure = false;
    await page.getByRole("button", { name: t.refresh, exact: true }).click();
    await expect(print).toBeEnabled();
    await expect(
      page.getByRole("button", { name: t.previous, exact: true }),
    ).toBeEnabled();
    if (locale === "en") {
      empty = true;
      await page.getByRole("button", { name: t.refresh, exact: true }).click();
      await expect(page.getByText(t.empty, { exact: true })).toBeVisible();
      await expect(print).toBeEnabled();
      await page.pdf({
        path: "/tmp/rep1-browser-qa/empty-report.pdf",
        preferCSSPageSize: true,
        printBackground: true,
      });
      empty = false;
      await page.getByRole("button", { name: t.refresh, exact: true }).click();
      await expect(print).toBeEnabled();
    }
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.emulateMedia({ media: "print" });
    await expect(page.locator("aside")).toBeHidden();
    await expect(print).toBeHidden();
    expect(
      await page
        .locator("main")
        .evaluate((node) => getComputedStyle(node).overflow),
    ).toBe("visible");
    await page.pdf({
      path: `/tmp/rep1-browser-qa/${locale}-report.pdf`,
      preferCSSPageSize: true,
      printBackground: true,
    });
    await page.screenshot({
      path: `/tmp/rep1-browser-qa/${locale}-print.png`,
      fullPage: true,
    });
    if (locale === "en") {
      await page
        .locator("#weekly-report table")
        .first()
        .evaluate((table) => {
          const tbody = table.querySelector("tbody")!;
          for (let i = 0; i < 100; i++) {
            const tr = document.createElement("tr");
            tr.innerHTML = `<th scope="row">Synthetic overflow row ${i + 1}</th><td>20000</td>`;
            tbody.appendChild(tr);
          }
        });
      await page.pdf({
        path: "/tmp/rep1-browser-qa/overflow-report.pdf",
        preferCSSPageSize: true,
        printBackground: true,
      });
    }
  });
}
