import { expect, test } from "@playwright/test";
import {
  fixture,
  openInbox,
  pageResidue,
  patientName,
  recordApiBodies,
  signIn,
  signOut,
} from "../support/fixture";

test.describe("identity isolation in the browser", () => {
  test("A → logout → B in the same tab never shows A patient data, even with A responses delayed", async ({
    page,
  }) => {
    const { clinics } = fixture();
    const a = clinics.A;
    const secretsOfA = [
      patientName(a.assignedPatient),
      patientName(a.unassignedPatient),
      a.assignedPatient.text,
      a.unassignedPatient.text,
      a.assignedPatient.phone,
      a.name,
    ];

    await signIn(page, "ownerA");
    await openInbox(page);
    await expect(page.getByText(patientName(a.assignedPatient))).toBeVisible();

    // Hold every A list/detail response back by 4s so it can arrive after the identity change.
    await page.route(/\/(conversations|leads|notifications)/, async (route) => {
      if (route.request().resourceType() === "document")
        return route.continue();
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.fulfill({ response }).catch(() => undefined);
    });
    await page.locator("#inbox-filter").selectOption({ index: 1 }); // forces a fresh (delayed) fetch

    await signOut(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });

    const seen = recordApiBodies(page);
    await signIn(page, "ownerB");
    await openInbox(page);
    await expect(
      page.getByText(patientName(clinics.B.assignedPatient)),
    ).toBeVisible();
    await page.waitForTimeout(5000); // longer than the delay applied to A's responses

    const residue = await pageResidue(page);
    for (const secret of secretsOfA) {
      expect(residue, `DOM/storage leaked: ${secret}`).not.toContain(secret);
      for (const body of seen.bodies)
        expect(body, `payload leaked: ${secret}`).not.toContain(secret);
    }
    // Cookies/storage must not carry A's identity either.
    expect(residue).not.toContain(fixture().users.ownerA.email);
  });

  test("logging out in one tab logs out the other without a reload", async ({
    context,
  }) => {
    const first = await context.newPage();
    await signIn(first, "ownerA");
    await openInbox(first);
    const second = await context.newPage();
    await openInbox(second); // hydrates from the shared refresh cookie
    await expect(
      second.getByText(patientName(fixture().clinics.A.assignedPatient)),
    ).toBeVisible();

    await signOut(second);
    await first.waitForURL("**/login", { timeout: 10_000 });
    expect(await pageResidue(first)).not.toContain(
      fixture().clinics.A.assignedPatient.text,
    );
  });
});
