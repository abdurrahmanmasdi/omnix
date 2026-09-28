"use client";

import { getLeadsControllerFindAllQueryKey } from "@/lib/api/generated/leads/leads";
import { getPipelineStagesControllerFindAllQueryKey } from "@/lib/api/generated/pipeline-stages/pipeline-stages";
import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  useLeadsControllerFindAll,
  useLeadsControllerRemove,
} from "@/lib/api/generated/leads/leads";
import { useLeadSourcesControllerFindAll } from "@/lib/api/generated/lead-sources/lead-sources";
import {
  buildSearchFilter,
  combineFilters,
  FilterCondition,
} from "@/lib/utils/ast-filter-builder";
import { useSocket } from "@/hooks/useSocket";
import type { LeadUpdatePayload } from "@/hooks/useSocket";
import { useQueryClient } from "@tanstack/react-query";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import { LeadFormModal } from "./LeadFormModal";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

import { LeadsHeader } from "./LeadsHeader";
import { LeadsToolbar } from "./LeadsToolbar";
import { LeadsTable } from "./LeadsTable";
import { LeadsPagination } from "./LeadsPagination";

export function LeadsDashboardClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // ─── Stable URL update helper ─────────────────────────────
  // We use a ref so the callback identity never changes, breaking the
  // render-loop that occurs when searchParams triggers a new useCallback.
  const searchParamsRef = useRef(searchParams);
  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const updateUrl = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParamsRef.current.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "") {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

  // ─── URL-derived state ────────────────────────────────────
  const page = Number(searchParams.get("page")) || 1;
  const limit = 10;
  const search = searchParams.get("search") || "";
  const filtersParam = searchParams.get("filters");

  // Advanced conditions & sort (local state synced to URL on change)
  const [advancedConditions, setAdvancedConditions] = useState<
    FilterCondition[]
  >(filtersParam ? JSON.parse(filtersParam) : []);
  const [sortBy, setSortBy] = useState<{
    field: string;
    direction: "asc" | "desc";
  }>(
    searchParams.get("sortField")
      ? {
          field: searchParams.get("sortField") as string,
          direction: (searchParams.get("sortDir") as "asc" | "desc") || "desc",
        }
      : { field: "createdAt", direction: "desc" },
  );

  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [leadToEdit, setLeadToEdit] = useState<string | null>(null);

  // ─── Stable event handlers ────────────────────────────────
  const handleSearchChange = useCallback(
    (newSearch: string) => {
      updateUrl({ search: newSearch, page: "1" });
    },
    [updateUrl],
  );

  const handleFiltersChange = useCallback(
    (conditions: FilterCondition[]) => {
      setAdvancedConditions(conditions);
      updateUrl({
        filters: conditions.length > 0 ? JSON.stringify(conditions) : null,
        page: "1",
      });
    },
    [updateUrl],
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateUrl({ page: newPage.toString() });
    },
    [updateUrl],
  );

  const handleSortChange = useCallback(
    (field: string) => {
      setSortBy((prev) => {
        const newDir =
          prev.field === field && prev.direction === "desc" ? "asc" : "desc";
        updateUrl({ sortField: field, sortDir: newDir, page: "1" });
        return { field, direction: newDir };
      });
    },
    [updateUrl],
  );

  // ─── AST filters ─────────────────────────────────────────
  const filters = useMemo(() => {
    return combineFilters(
      buildSearchFilter(search, [
        "firstName",
        "lastName",
        "phoneNumber",
        "email",
        "country",
      ]),
      ...advancedConditions,
    );
  }, [search, advancedConditions]);

  // ─── Data fetching ────────────────────────────────────────
  const { data, isLoading, refetch } = useLeadsControllerFindAll({
    page,
    limit,
    filters: filters ? JSON.stringify(filters) : undefined,
    sorts: JSON.stringify([sortBy]),
  });

  // ─── Real-time: Invalidate on lead updates from backend ────
  useEffect(() => {
    if (!socket) return;

    const handleLeadUpdate = async (data: LeadUpdatePayload) => {
      console.log("[Socket] onLeadUpdate received:", data.id);

      // Cancel any outgoing refetches so they don't overwrite our new state
      await queryClient.cancelQueries({ queryKey: ["/leads"] });
      await queryClient.cancelQueries({ queryKey: ["/pipeline-stages"] });

      // Invalidate all leads queries (list, individual, any filtered view)
      queryClient.invalidateQueries({ queryKey: getLeadsControllerFindAllQueryKey() });

      // Invalidate pipeline stages since lead stage assignments may have changed
      queryClient.invalidateQueries({ queryKey: getPipelineStagesControllerFindAllQueryKey() });
    };

    socket.on("onLeadUpdate", handleLeadUpdate);
    return () => {
      socket.off("onLeadUpdate", handleLeadUpdate);
    };
  }, [socket, queryClient]);

  const { data: sourcesData } = useLeadSourcesControllerFindAll();
  const sources = useMemo(() => {
    const d = sourcesData as unknown as { items?: unknown[] } | unknown[];
    if (Array.isArray(d)) return d as { id: string; name: string }[];
    if (d?.items && Array.isArray(d.items))
      return d.items as { id: string; name: string }[];
    return [] as { id: string; name: string }[];
  }, [sourcesData]);

  const deleteMutation = useLeadsControllerRemove();

  const paginatedLeads = data as unknown as
    | {
        items?: unknown[];
        data?: unknown[];
        total?: number;
        totalPages?: number;
        meta?: { totalItems?: number; totalPages?: number };
      }
    | unknown[];
  const leads = useMemo(() => {
    let result: unknown[] = [];
    if (Array.isArray(paginatedLeads)) {
      result = paginatedLeads;
    } else if (paginatedLeads && typeof paginatedLeads === "object") {
      if ("items" in paginatedLeads && Array.isArray(paginatedLeads.items))
        result = paginatedLeads.items;
      else if ("data" in paginatedLeads && Array.isArray(paginatedLeads.data))
        result = paginatedLeads.data;
    }
    return result as { id: string; [key: string]: unknown }[];
  }, [paginatedLeads]);

  const plObj = paginatedLeads as {
    total?: number;
    totalPages?: number;
    meta?: { totalItems?: number; totalPages?: number };
  };
  const totalLeads = plObj?.total || plObj?.meta?.totalItems || leads.length;
  const totalPages = plObj?.totalPages || plObj?.meta?.totalPages || 1;

  // ─── Row-level actions ────────────────────────────────────
  const handleEdit = useCallback((id: string) => {
    setLeadToEdit(id);
    setIsFormModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    (id: string) => {
      if (
        confirm("Are you sure you want to delete this high-priority record?")
      ) {
        deleteMutation.mutate(
          { id },
          {
            onSuccess: () => {
              toast.success("Patient record deleted");
              refetch();
            },
            onError: () =>
              toast.error(
                "Encryption policy prevents deletion or server error.",
              ),
          },
        );
      }
    },
    [deleteMutation, refetch],
  );

  const handleOpenConversation = useCallback(
    (conversationId?: string) => {
      if (conversationId) {
        router.push(`/dashboard/conversations/${conversationId}`);
      } else {
        toast.error("No conversation linked to this patient yet.");
      }
    },
    [router],
  );

  const handleClearFilters = useCallback(
    () => handleFiltersChange([]),
    [handleFiltersChange],
  );

  return (
    <div className="p-8 space-y-6 max-w-[1600px] mx-auto animate-in fade-in duration-500">
      <LeadsHeader
        onNewOnboarding={() => {
          setLeadToEdit(null);
          setIsFormModalOpen(true);
        }}
      />

      <Card className="shadow-2xl shadow-black/40 border-white/5 overflow-hidden rounded-2xl bg-brand-navy/50 backdrop-blur-xl">
        <LeadsToolbar
          onSearchChange={handleSearchChange}
          onFiltersChange={handleFiltersChange}
          initialSearch={search}
          initialFilters={advancedConditions}
          totalLeads={totalLeads}
          page={page}
          totalPages={totalPages}
        />

        <CardContent className="p-0">
          <LeadsTable
             
            leads={leads as any}
            sources={sources}
            isLoading={isLoading}
            sortBy={sortBy}
            onSortChange={handleSortChange}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onViewProfile={setSelectedLeadId}
            onOpenConversation={handleOpenConversation}
            onClearFilters={handleClearFilters}
          />

          <LeadsPagination
            page={page}
            totalPages={totalPages}
            totalItems={totalLeads}
            onPageChange={handlePageChange}
          />
        </CardContent>
      </Card>

      <LeadDetailDrawer
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        onUpdate={refetch}
        onEdit={handleEdit}
      />

      <LeadFormModal
        isOpen={isFormModalOpen}
        leadId={leadToEdit}
        onClose={() => {
          setIsFormModalOpen(false);
          setLeadToEdit(null);
        }}
        onSuccess={refetch}
      />
    </div>
  );
}
