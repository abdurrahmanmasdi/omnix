import { describe, expect, it } from "vitest";
import type { InfiniteData } from "@tanstack/react-query";
import type {
  InboxMessageDto,
  InboxMessagesPageDto,
  InboxPatientDto,
} from "@/lib/api/model";
import {
  delivery,
  mergeMessage,
  uniqueMessages,
  dirtyPatientFields,
  blockedCopy,
  sender,
} from "./model";
import { inboxText } from "./i18n";
import { notificationRoute, resolveNotification } from "./notifications";
import type { NotificationInvalidationPayload } from "@/lib/contracts/socket-events.generated";

const message: InboxMessageDto = {
  id: "m1",
  conversationId: "conv",
  senderId: null,
  mediaUrl: null,
  content: "Synthetic",
  type: "AI_TEXT",
  handledBy: "AI",
  status: "PENDING",
  createdAt: "2026-10-03T10:00:00Z",
  updatedAt: "2026-10-03T10:00:00Z",
};
const patient: InboxPatientDto = {
  id: "patient",
  firstName: "Çağrı",
  lastName: "Şahin",
  phoneNumber: "*******1234",
  email: "ca***@example.invalid",
  country: "Türkiye",
  timezone: "Europe/Istanbul",
  primaryLanguage: "tr",
  status: "NEW",
  priority: "WARM",
  assignedAgentId: null,
  assigneeName: null,
  pipelineStageId: null,
  stageName: null,
  summary: null,
  optedOut: false,
};
const history: InfiniteData<InboxMessagesPageDto> = {
  pages: [{ data: [message], hasMore: false, nextCursor: null }],
  pageParams: [""],
};
describe("Inbox contract behavior", () => {
  it.each([
    ["PENDING", "pending"],
    ["SENT", "sent"],
    ["DELIVERED", "delivered"],
    ["READ", "read"],
    ["FAILED", "failed"],
    ["UNKNOWN", "unknown"],
    ["CANCELLED", "cancelled"],
  ])("labels %s as %s", (status, label) => {
    expect(delivery({ ...message, status }).label).toBe(label);
  });
  it("a draft is never sent, even if its processing status says SENT", () => {
    expect(delivery({ ...message, type: "AI_DRAFT", status: "SENT" })).toEqual({
      label: "draft",
      tip: "draftTip",
    });
  });
  it.each([
    ["LEAD_TEXT", "patient"],
    ["AI_TEXT", "ai"],
    ["USER_TEXT", "staff"],
    ["TOOL_RESULT", "system"],
  ])("identifies %s sender", (type, expected) => {
    expect(sender({ ...message, type })).toBe(expected);
  });
  it("updates a repeated id rather than appending a duplicate", () => {
    const merged = mergeMessage(history, {
      ...message,
      status: "READ",
      updatedAt: "2026-10-03T10:01:00Z",
    });
    expect(merged?.pages[0].data).toHaveLength(1);
    expect(merged?.pages[0].data[0].status).toBe("READ");
  });
  it("adds a new message once across history pages", () => {
    const twice = mergeMessage(
      mergeMessage(history, { ...message, id: "m2" }),
      { ...message, id: "m2" },
    );
    expect(twice?.pages[0].data).toHaveLength(2);
  });
  it("cannot revive stale delivery events or hide uncertain sends", () => {
    const unknown = mergeMessage(history, { ...message, status: "UNKNOWN" });
    expect(mergeMessage(unknown, message)?.pages[0].data[0].status).toBe(
      "UNKNOWN",
    );
  });
  it("deduplicates cursor overlaps chronologically", () => {
    expect(
      uniqueMessages([
        { data: [message], hasMore: true, nextCursor: "m1" },
        { data: [message], hasMore: false, nextCursor: null },
      ]),
    ).toEqual([message]);
  });
  it("does not cache a socket event before an authorized history load", () => {
    expect(mergeMessage(undefined, message)).toBeUndefined();
  });
  it("patches only dirty fields and refuses masked contact edits", () => {
    expect(
      dirtyPatientFields(patient, {
        ...patient,
        firstName: "İpek",
        phoneNumber: "******4321",
        email: "different@example.invalid",
      }),
    ).toEqual({ firstName: "İpek" });
  });
  it("never patches newly entered masked data", () => {
    expect(
      dirtyPatientFields(
        { ...patient, phoneNumber: "+905550001234", email: null },
        { ...patient, email: null },
      ),
    ).toEqual({});
  });
  it("does not turn opt-out into a send block", () => {
    expect(blockedCopy("PATIENT_OPTED_OUT")).toBeUndefined();
  });
  it.each([
    "OUTSIDE_24H_WINDOW",
    "CHANNEL_UNAVAILABLE",
    "NO_CONTACT",
    "CLINIC_INACTIVE",
    "DELIVERY_NOT_AUTHORIZED",
  ])("provides copy for %s", (code) => {
    expect(blockedCopy(code)).toBeDefined();
  });
  it.each(["tr", "en"])(
    "has translated draft and opt-out notice in %s",
    (locale) => {
      const selected = locale === "en" ? "en" : "tr";
      expect({
        draft: inboxText(selected, "draft"),
        optOut: inboxText(selected, "optedOut"),
      }).toMatchSnapshot();
    },
  );
  it("resolves the real generic UPDATE via authorized HTTP details", () => {
    const payload: NotificationInvalidationPayload = {
      id: "notification",
      organizationId: "org",
      type: "UPDATE",
      title: "New notification",
      body: "Open notifications to view details.",
    };
    const row = {
      id: payload.id,
      type: "LEAD_HANDED_OFF",
      referenceType: "LEAD",
      referenceId: "patient",
    };
    expect(resolveNotification(payload, [row])).toEqual(row);
    expect(notificationRoute(row)).toBe(
      "/dashboard/conversations?lead=patient",
    );
    expect(resolveNotification(payload, [])).toBeUndefined();
  });
  it("deep-links conversations and escapes IDs", () => {
    expect(
      notificationRoute({
        referenceType: "CONVERSATION",
        referenceId: "conv & value",
      }),
    ).toBe("/dashboard/conversations?conversation=conv%20%26%20value");
  });
});
