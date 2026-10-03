import { expect, test } from "@playwright/test";
import {
  API_URL,
  backendFixture,
  fixture,
  openInbox,
  pageResidue,
  patientName,
  signIn,
} from "../support/fixture";

test.describe("revocation while connected", () => {
  test("a role downgrade removes message content after the next refresh of data", async ({
    page,
  }) => {
    const a = fixture().clinics.A;
    await signIn(page, "coordinatorA");
    await openInbox(page);
    await page.getByText(patientName(a.assignedPatient)).click();
    await expect(page.getByText(a.assignedPatient.text)).toBeVisible();

    backendFixture("downgrade", "coordinatorA"); // removes PII, message and read-all grants

    await page.reload(); // a fresh read with the same live session
    await openInbox(page);
    const residue = await pageResidue(page);
    expect(residue).not.toContain(a.assignedPatient.text);
    expect(residue).not.toContain(a.unassignedPatient.text);
    expect(residue).not.toContain(a.assignedPatient.phone);
  });

  test("account recovery invalidates an already open session", async ({
    browser,
  }) => {
    const open = await browser.newContext();
    const page = await open.newPage();
    await signIn(page, "ownerB");
    await openInbox(page);

    const link = backendFixture("recovery", "ownerB");
    const other = await browser.newContext();
    const recovery = await other.newPage();
    await recovery.goto(link);
    await recovery
      .locator("#newPassword")
      .fill(`Rotated-${Date.now()}-synthetic-pw`);
    await recovery.getByRole("button", { name: /reset/i }).click();
    await expect(recovery.getByText(/successfully reset/i)).toBeVisible();

    // The old session can no longer fetch or refresh: next data read sends it to /login.
    await page.reload();
    await page.waitForURL("**/login", { timeout: 15_000 });
    const probe = await open.request.post(`${API_URL}/auth/refresh`);
    expect(probe.status()).toBe(401);
    await open.close();
    await other.close();
  });
});
