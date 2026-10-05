"use client";
import { useCopy } from "@/i18n/copy";

import { useState } from "react";
import {
  useLeadSourcesControllerFindAll,
  useLeadSourcesControllerRemove,
} from "@/lib/api/generated/lead-sources/lead-sources";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Target,
  Plus,
  Loader2,
  Edit,
  Trash2,
  MoreVertical,
} from "lucide-react";
import { toast } from "sonner";
import { LeadSourceFormModal } from "@/components/lead-sources/LeadSourceFormModal";

export default function LeadSourcesPage() {
  const copy = useCopy();

  const { data, isLoading, refetch } = useLeadSourcesControllerFindAll();
  const deleteMutation = useLeadSourcesControllerRemove();

  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const sources = Array.isArray(data)
    ? data
    : (data as { items?: unknown[] })?.items || [];

  const handleEdit = (id: string) => {
    setSelectedSourceId(id);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setSelectedSourceId(null);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (
      confirm(
        copy(
          "Are you sure you want to delete this source? This may affect historical attribution metrics.",
        ),
      )
    ) {
      deleteMutation.mutate(
        { id },
        {
          onSuccess: () => {
            toast.success(copy("Source deleted successfully"));
            refetch();
          },
          onError: () =>
            toast.error(copy("Failed to delete source. It might be in use.")),
        },
      );
    }
  };

  return (
    <div className="p-8 space-y-6 max-w-[1200px] mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-brand-ice tracking-tight flex items-center">
            {copy("MARKETING SOURCES")}
            <Badge
              variant="outline"
              className="ms-3 bg-purple-600 text-white border-none px-2 py-0 h-5 text-[10px] font-black tracking-tighter"
            >
              {copy("SETTINGS")}
            </Badge>
          </h1>
          <p className="text-brand-ice/60 font-medium mt-1">
            {copy(
              "Configure attribution channels for patient origin tracking.",
            )}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <Button
            className="bg-purple-600 hover:bg-purple-700 shadow-none shadow-purple-200 h-11 rounded-xl font-bold transition-all active:scale-95"
            onClick={handleCreate}
          >
            <Plus className="me-2 h-4 w-4" />
            {copy("New Source")}
          </Button>
        </div>
      </div>

      <Card className="shadow-2xl shadow-none border-white/10 overflow-hidden rounded-2xl bg-transparent/80 backdrop-blur-xl">
        <CardHeader className="border-b border-white/10 py-5 px-8 flex flex-row items-center justify-between bg-transparent/50">
          <div className="flex items-center space-x-2 text-sm font-bold text-brand-ice/80 uppercase tracking-widest">
            <Target className="h-5 w-5 text-purple-500" />
            <span>{copy("Configured Channels")}</span>
          </div>
          <Badge className="bg-brand-deep text-brand-ice/60 hover:bg-slate-200 shadow-inner font-black px-3 py-1">
            {sources.length}
            {copy("Total")}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-brand-navy/50 hover:bg-brand-navy/50 border-b border-white/10">
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 px-8 w-2/3">
                    {copy("Channel Name")}
                  </TableHead>
                  <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14">
                    {copy("Status")}
                  </TableHead>
                  <TableHead className="text-end font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-14 pe-8">
                    {copy("Actions")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-48 text-center">
                      <div className="flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                        <span className="text-sm font-bold text-brand-ice/60 uppercase tracking-widest">
                          {copy("Loading Channels...")}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="h-48 text-center">
                      <p className="text-sm font-medium text-brand-ice/60">
                        {copy("No marketing sources configured.")}
                      </p>
                      <Button
                        variant="link"
                        onClick={handleCreate}
                        className="text-purple-600 font-bold mt-2"
                      >
                        {copy("Create your first source")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  sources.map(
                    (source: {
                      id: string;
                      name: string;
                      isActive?: boolean;
                    }) => (
                      <TableRow
                        key={source.id}
                        className="group hover:bg-brand-navy/80 transition-all border-s-4 border-s-transparent hover:border-s-purple-600"
                      >
                        <TableCell className="px-8 font-bold text-brand-ice/80 text-sm">
                          {source.name}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`${source.isActive !== false ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-brand-navy0/10 text-brand-ice/60 border-slate-500/20"} px-3 py-1 border shadow-none text-[10px] font-bold rounded-lg tracking-tight`}
                          >
                            {source.isActive !== false ? "ACTIVE" : "INACTIVE"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-end pe-8">
                          <div className="flex items-center justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-brand-ice/60 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                              onClick={() => handleEdit(source.id)}
                            >
                              <Edit className="h-4.5 w-4.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 text-brand-ice/60 hover:text-brand-ice hover:bg-brand-deep rounded-xl transition-all"
                                >
                                  <MoreVertical className="h-4.5 w-4.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="end"
                                className="w-48 shadow-2xl border-white/10 rounded-xl p-2 animate-in slide-in-from-top-1 duration-200"
                              >
                                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest text-brand-ice/60 px-3 py-2">
                                  {copy("Operations")}
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  className="rounded-lg font-bold text-brand-ice/80 py-2.5 cursor-pointer"
                                  onClick={() => handleEdit(source.id)}
                                >
                                  <Edit className="me-3 h-4 w-4 text-purple-500" />
                                  {copy("Edit Channel")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator className="my-2 bg-brand-deep" />
                                <DropdownMenuItem
                                  className="rounded-lg font-bold text-red-400 focus:text-red-400 focus:bg-red-500/10 py-2.5 cursor-pointer"
                                  onClick={() => handleDelete(source.id)}
                                >
                                  <Trash2 className="me-3 h-4 w-4" />
                                  {copy("Delete Channel")}
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ),
                  )
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <LeadSourceFormModal
        isOpen={isModalOpen}
        sourceId={selectedSourceId}
        onClose={() => setIsModalOpen(false)}
        onSuccess={refetch}
      />
    </div>
  );
}
