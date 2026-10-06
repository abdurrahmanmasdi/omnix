import { Suspense } from "react";
import { Inbox } from "@/features/inbox/Inbox";

export default function ConversationsPage() {
  return (
    <Suspense>
      <Inbox />
    </Suspense>
  );
}
