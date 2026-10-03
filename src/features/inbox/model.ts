import type { InfiniteData } from "@tanstack/react-query";
import type {
  InboxMessageDto,
  InboxMessagesPageDto,
  InboxPatientDto,
  UpdateLeadDto,
} from "@/lib/api/model";
import type { InboxString } from "./i18n";

export function mergeMessage(
  history: InfiniteData<InboxMessagesPageDto> | undefined,
  message: InboxMessageDto,
): InfiniteData<InboxMessagesPageDto> | undefined {
  if (!history?.pages.length) return history;
  let found = false;
  const pages = history.pages.map((page) => ({
    ...page,
    data: page.data.map((old) => {
      if (old.id !== message.id) return old;
      found = true;
      if (message.updatedAt < old.updatedAt) return old;
      // A repeated creation event cannot erase a receipt or uncertain attempt outcome.
      if (
        ["READ", "DELIVERED", "UNKNOWN"].includes(old.status) &&
        ["PENDING", "PROCESSING", "PROCESSED", "SENT"].includes(message.status)
      )
        return old;
      return message;
    }),
  }));
  if (!found) pages[0] = { ...pages[0], data: [message, ...pages[0].data] };
  return { ...history, pages };
}
export function uniqueMessages(
  pages: InboxMessagesPageDto[],
): InboxMessageDto[] {
  const byId = new Map<string, InboxMessageDto>();
  for (const page of pages)
    for (const message of page.data) {
      const old = byId.get(message.id);
      if (!old || old.updatedAt < message.updatedAt)
        byId.set(message.id, message);
    }
  return [...byId.values()].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  );
}
export function sender(message: InboxMessageDto): InboxString {
  if (message.type.startsWith("LEAD_")) return "patient";
  if (message.type.startsWith("AI_")) return "ai";
  if (message.type.startsWith("USER_")) return "staff";
  return "system";
}
export function delivery(message: InboxMessageDto): {
  label: InboxString;
  tip: InboxString;
} {
  if (message.type === "AI_DRAFT") return { label: "draft", tip: "draftTip" };
  if (sender(message) === "patient")
    return { label: "received", tip: "receivedTip" };
  switch (message.status) {
    case "PENDING":
    case "PROCESSING":
      return { label: "pending", tip: "pendingTip" };
    case "SENT":
      return { label: "sent", tip: "sentTip" };
    case "DELIVERED":
      return { label: "delivered", tip: "deliveredTip" };
    case "READ":
      return { label: "read", tip: "readTip" };
    case "FAILED":
      return { label: "failed", tip: "failedTip" };
    case "CANCELLED":
      return { label: "cancelled", tip: "cancelledTip" };
    default:
      return { label: "unknown", tip: "unknownTip" };
  }
}
export function isMasked(value: string | null | undefined): boolean {
  return !!value && /[*•●]/u.test(value);
}
export type PatientEdits = Pick<
  InboxPatientDto,
  | "firstName"
  | "lastName"
  | "phoneNumber"
  | "email"
  | "country"
  | "primaryLanguage"
>;
export function dirtyPatientFields(
  original: InboxPatientDto,
  edits: PatientEdits,
): UpdateLeadDto {
  const patch: UpdateLeadDto = {};
  if (edits.firstName !== original.firstName) patch.firstName = edits.firstName;
  if (edits.lastName !== original.lastName) patch.lastName = edits.lastName;
  if (edits.country !== original.country) patch.country = edits.country;
  if (edits.primaryLanguage !== original.primaryLanguage)
    patch.primaryLanguage = edits.primaryLanguage;
  if (
    edits.phoneNumber !== original.phoneNumber &&
    !isMasked(original.phoneNumber) &&
    !isMasked(edits.phoneNumber)
  )
    patch.phoneNumber = edits.phoneNumber;
  if (
    edits.email !== original.email &&
    !isMasked(original.email) &&
    !isMasked(edits.email) &&
    edits.email
  )
    patch.email = edits.email;
  return patch;
}
export function blockedCopy(code: string): InboxString | undefined {
  switch (code) {
    case "OUTSIDE_24H_WINDOW":
      return "window";
    case "CHANNEL_UNAVAILABLE":
      return "channel";
    case "NO_CONTACT":
      return "noContact";
    case "CLINIC_INACTIVE":
      return "inactive";
    case "DELIVERY_NOT_AUTHORIZED":
      return "changed";
    default:
      return undefined;
  }
}
