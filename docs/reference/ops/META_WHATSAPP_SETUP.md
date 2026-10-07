# WhatsApp setup for OmniX — step by step

_2026-10-07 · Claude (planner). For the founder. Goes to `docs/reference/ops/` after the AI-3a card._

## Your situation

- You have **no registered company yet**, and you'll register one only after the first sales.
- Meta lets only a **Tech Provider or Solution Partner** onboard an existing WhatsApp Business app number ("coexistence"). Becoming a Tech Provider needs **Meta business verification**, which needs a registered business with documents ([Meta: onboarding Business app users](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/), [Meta: become a Tech Provider](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)).
- **So today you cannot run coexistence under your own name.** The code we built in M4 is ready for the day you have a company.

There are three paths, from "works today" to "later":

| Path | Who owns the WhatsApp connection | Clinic keeps its phone app? | Needs your company? | Extra OmniX work |
| --- | --- | --- | --- | --- |
| **A. Clinic signs up with 360dialog (recommended now)** | The clinic, via 360dialog (an official Meta partner) | **Yes** (coexistence) | No | One small card: a 360dialog connector |
| **B. Clinic's own Meta app (works today in OmniX)** | The clinic's own Meta business | **No** — needs a number not on the phone app | No | None |
| **C. OmniX as Tech Provider (built in M4)** | OmniX | **Yes** | **Yes** | None (already built) |

---

## Path A — the clinic connects through 360dialog (recommended for the pilot)

360dialog lets a **direct customer** (the clinic itself) connect its existing WhatsApp Business app number in coexistence mode by scanning a QR code ([360dialog: coexistence onboarding](https://docs.360dialog.com/docs/hub/embedded-signup/coexistence-onboarding)). The clinic is the customer, not you, so you need no company.

**What the clinic needs**
- A **Meta Business Portfolio** in the clinic's name, filled in with legal name, address, website and business phone. Non-EU numbers (Turkey) don't strictly need a Facebook account, according to 360dialog.
- The WhatsApp Business app, **version 2.24.17 or newer**, on the phone with the clinic's number.
- A card for the 360dialog monthly fee plus Meta's message fees (check current prices on 360dialog's site).

**Steps (you sit with the clinic; about 20 minutes)**
1. The clinic creates a 360dialog account and opens the **Hub**.
2. **Add channel** → choose a plan → enter the clinic's phone number.
3. Choose **"Yes, Business App"** (this is the coexistence option).
4. Scan the QR code with the clinic's phone (WhatsApp Business app → linked devices).
5. Allow the chat-history and contacts sync (optional, but useful).
6. Fill in the business info and finish. **The portfolio choice can't be changed later**, so pick the clinic's own portfolio.
7. In the Hub, **generate an API key** for this number and paste it into OmniX (Settings → Channels). This needs the new connector card.

**What we must build first (card M4b, small):** OmniX today talks to Meta directly. With 360dialog, OmniX talks to 360dialog's API instead: different address, API-key login, webhook setup through 360dialog. It also needs to confirm that 360dialog forwards the "message sent from phone" events (echoes), so phone replies still pause the AI. Estimate: one Codex card.

---

## Path B — clinic's own Meta app (no coexistence)

Works in OmniX today (Settings → Channels → paste credentials).
1. The clinic creates a Meta Business Portfolio and a Meta developer app with **WhatsApp**.
2. They add a phone number that is **not** used on the WhatsApp Business app (a new SIM, or remove it from the app first).
3. They create a permanent access token (System User) and paste the phone number ID, WABA ID and token into OmniX.
4. Limits: unverified businesses have low messaging limits, and the clinic loses the phone app on that number. **Fine for a demo or a trial with a second number, weak for a real pilot.**

---

## Path C — OmniX as Tech Provider (after you register a company)

Already built (M4). When you have a company:
1. **Meta Business Portfolio** for your company (business.facebook.com) → **Security Center → Start verification**. Documents: business registration and/or tax certificate, matching legal name, address, phone, website on your domain, email on your domain. Takes a few days to weeks.
2. **Meta developer app** (type Business) with the **WhatsApp** use case, connected to the verified portfolio.
3. App Dashboard → **Use cases → Customize → Tech Provider onboarding**.
4. App settings: icon, privacy policy URL, category.
5. Record **2 short screen videos**: (1) sending a message from OmniX to WhatsApp, (2) creating a message template.
6. Request **Advanced Access**: `whatsapp_business_messaging`, `whatsapp_business_management` → **Begin App Review**.
7. **Webhooks**: callback URL = your backend's WhatsApp webhook; fields `messages`, `account_update`, `history`, `smb_app_state_sync`, `smb_message_echoes`.
8. **Facebook Login for Business → new configuration (Embedded Signup v4)** → copy its ID into Railway `META_EMBEDDED_SIGNUP_CONFIG_ID`; app ID into `META_APP_ID`; add your dashboard domain to allowed domains.
9. Test with Meta test assets, then a test phone with WhatsApp Business app ≥ 2.24.17: Settings → Channels → **Connect existing WhatsApp number**.

---

## Recommendation

1. **Pilot:** Path A (clinic + 360dialog). We build card M4b next to the AI cards. For the demo before that, use **Path B** with a spare number.
2. **After the first paying clinics:** register the company, then Path C, so clinics connect in one click without a 360dialog account.
3. Ask in the clinic interviews whether they'd accept a 360dialog account (a small monthly fee in their name).
