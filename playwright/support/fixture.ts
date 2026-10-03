import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export type UserKey = "ownerA" | "coordinatorA" | "restrictedA" | "ownerB";
interface Patient {
  first: string;
  last: string;
  phone: string;
  text: string;
}
export interface Fixture {
  users: Record<
    UserKey,
    { email: string; password: string; firstName: string; lastName: string }
  >;
  clinics: Record<
    "A" | "B",
    {
      id: string;
      name: string;
      assignedPatient: Patient;
      unassignedPatient: Patient;
      agentRoleId: string;
    }
  >;
}

export const API_URL =
  process.env.PLAYWRIGHT_API_URL ?? "http://localhost:3000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001";

function fixtureFile(): string {
  const file = process.env.PLAYWRIGHT_FIXTURE_FILE;
  if (!file)
    throw new Error(
      "PLAYWRIGHT_FIXTURE_FILE is required (use playwright/run.sh)",
    );
  return file;
}
export const fixture = (): Fixture =>
  JSON.parse(readFileSync(fixtureFile(), "utf8")) as Fixture;
export const patientName = (p: Patient) => `${p.first} ${p.last}`;

/** Operator-style actions (recovery link, grant downgrade) run through the backend fixture script. */
export function backendFixture(
  command: "recovery" | "downgrade",
  key: UserKey,
): string {
  const backend =
    process.env.PLAYWRIGHT_BACKEND_DIR ??
    path.resolve(__dirname, "../../../backend-v2");
  return execFileSync(
    "npx",
    [
      "ts-node",
      "scripts/playwright-fixture.ts",
      command,
      fixtureFile(),
      key,
      BASE_URL,
    ],
    { cwd: backend, encoding: "utf8", env: process.env },
  ).trim();
}

export async function signIn(page: Page, key: UserKey): Promise<void> {
  const user = fixture().users[key];
  await page.goto("/login");
  await page.locator("#email").fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard**");
}
export async function signOut(page: Page): Promise<void> {
  await page.getByTestId("user-menu").click();
  await page.getByTestId("sign-out").click();
  await page.waitForURL("**/login");
}
export async function openInbox(page: Page): Promise<void> {
  await page.goto("/dashboard/conversations");
  await page.locator("#inbox-filter").waitFor();
}
export async function newSignedInPage(
  browser: Browser,
  key: UserKey,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, key);
  return { context, page };
}

/** Everything a page could still hold: DOM text, web storage, Cache Storage, IndexedDB names. */
export async function pageResidue(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const parts: string[] = [
      document.body.innerText,
      document.documentElement.outerHTML,
    ];
    for (const store of [localStorage, sessionStorage])
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i) as string;
        parts.push(k, store.getItem(k) ?? "");
      }
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const req of await cache.keys())
        parts.push(req.url, await (await cache.match(req))!.text());
    }
    const dbs = (await indexedDB.databases?.()) ?? [];
    parts.push(...dbs.map((d) => d.name ?? ""));
    return parts.join("\n");
  });
}

/** Records every API response body seen by a page so assertions can look at payloads, not just pixels. */
export function recordApiBodies(page: Page): {
  bodies: string[];
  urls: string[];
} {
  const seen = { bodies: [] as string[], urls: [] as string[] };
  page.on("response", async (response) => {
    if (!response.url().startsWith(API_URL)) return;
    seen.urls.push(`${response.status()} ${response.url()}`);
    try {
      seen.bodies.push(await response.text());
    } catch {
      /* response disposed by navigation */
    }
  });
  return seen;
}
