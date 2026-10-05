import { useCopy } from "@/i18n/copy";
import { Suspense } from "react";
import { LeadsDashboardClient } from "@/components/leads/LeadsDashboardClient";
import { Loader2 } from "lucide-react";

export default function LeadsPage() {
  const copy = useCopy();

  return (
    <Suspense
      fallback={
        <div className="h-screen w-full flex items-center justify-center">
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
            <p className="text-sm font-bold text-brand-ice/60 uppercase tracking-widest">
              {copy("Initializing Pipeline Workspace...")}
            </p>
          </div>
        </div>
      }
    >
      <LeadsDashboardClient />
    </Suspense>
  );
}
