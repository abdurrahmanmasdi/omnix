import { expect, test } from "@playwright/test";
import {
  API_URL,
  fixture,
  openInbox,
  patientName,
  signIn,
} from "../support/fixture";

test.describe("staff and restricted access in the Inbox", () => {
  test("staff invited into an existing clinic see that clinic only", async ({
    browser,
    request,
  }) => {
    const { users, clinics } = fixture();
    const login = await request.post(`${API_URL}/auth/login`, {
      data: { email: users.ownerA.email, password: users.ownerA.password },
    });
    expect(login.ok()).toBeTruthy();
    const accessToken = ((await login.json()) as { access_token: string })
      .access_token;
    const email = `joiner-${Date.now()}@example.invalid`;
    const issued = await request.post(`${API_URL}/auth/invitations/clinic`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { email, roleId: clinics.A.agentRoleId },
    });
    expect(issued.status()).toBe(201);
    const { token } = (await issued.json()) as { token: string };

    const context = await browser.newContext();
    const page = await context.newPage();
    const password = `Joiner-${Date.now()}-synthetic-pw`;
    await page.goto(`/accept-invitation#token=${token}&type=clinic`);
    await page.locator("#firstName").fill("Joined");
    await page.locator("#lastName").fill("Staff");
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /activate account/i }).click();
    // Leaving the page before the accept request finishes would abort it.
    await expect(page.getByText("Account activated")).toBeVisible();

    await page.goto("/login");
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/dashboard**");
    await openInbox(page);
    // A new Agent has no assigned patients: clinic A's unassigned patient and all of clinic B stay hidden.
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(patientName(clinics.A.unassignedPatient));
    expect(text).not.toContain(patientName(clinics.B.assignedPatient));
    await context.close();
  });

  test('restricted staff get "no access" messaging, not an empty thread', async ({
    page,
  }) => {
    const { clinics } = fixture();
    const a = clinics.A;
    await signIn(page, "restrictedA");
    await openInbox(page);
    await expect(page.getByText(patientName(a.assignedPatient))).toBeVisible();
    await expect(page.getByText(patientName(a.unassignedPatient))).toHaveCount(
      0,
    );

    const deniedHistory = page.waitForResponse(
      (response) =>
        response.url().startsWith(`${API_URL}/conversations/`) &&
        new URL(response.url()).pathname.endsWith("/messages") &&
        response.request().method() === "GET",
    );
    await page.getByText(patientName(a.assignedPatient)).click();
    expect((await deniedHistory).status()).toBe(403);
    // The browser suite explicitly requests English. A denied history read must show an alert.
    const alert = page.getByRole("alert").filter({
      hasText: "You don't have access to this conversation's messages",
    });
    await expect(alert).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).not.toContain(a.assignedPatient.text);
    expect(text).not.toContain(a.assignedPatient.phone);
  });
});
