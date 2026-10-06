"use client";
import { useLocale } from "next-intl";
import { useCopy } from "@/i18n/copy";

import { useState, useRef, useCallback } from "react";
import {
  useDocumentsControllerGetDocuments,
  useDocumentsControllerUploadDocument,
  useDocumentsControllerDeleteDocument,
} from "@/lib/api/generated/documents/documents";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FileText,
  UploadCloud,
  Trash2,
  CheckCircle2,
  Loader2,
  AlertCircle,
  FilePlus,
} from "lucide-react";
import { toast } from "sonner";

export default function DocumentsSettingsPage() {
  const copy = useCopy();
  const locale = useLocale();

  const {
    data: documents = [],
    refetch,
    isLoading,
  } = useDocumentsControllerGetDocuments();
  const uploadMutation = useDocumentsControllerUploadDocument();
  const deleteMutation = useDocumentsControllerDeleteDocument();

  // Drag & Drop State
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete Dialog State
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateAndUpload = useCallback(
    (file: File) => {
      if (file.type !== "application/pdf") {
        toast.error(copy("Only PDF files are supported."));
        return;
      }

      // 10MB limit (10 * 1024 * 1024 bytes)
      if (file.size > 10 * 1024 * 1024) {
        toast.error(copy("File exceeds the maximum limit of 10MB."));
        return;
      }

      uploadMutation.mutate(
        { data: { file: file as unknown as Blob } },
        {
          onSuccess: () => {
            toast.success(
              copy("Document uploaded successfully. Processing started."),
            );
            refetch();
          },
          onError: () => {
            toast.error(
              copy("Failed to upload the document. Please try again."),
            );
          },
        },
      );
    },
    [copy, uploadMutation, refetch],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        validateAndUpload(e.dataTransfer.files[0]);
        e.dataTransfer.clearData();
      }
    },
    [validateAndUpload],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files[0]);
      // Reset input value so same file can be selected again if needed
      e.target.value = "";
    }
  };

  const confirmDelete = () => {
    if (!documentToDelete) return;
    deleteMutation.mutate(
      { id: documentToDelete },
      {
        onSuccess: () => {
          toast.success(copy("Document deleted successfully."));
          setDocumentToDelete(null);
          refetch();
        },
        onError: () => {
          toast.error(copy("Failed to delete document."));
          setDocumentToDelete(null);
        },
      },
    );
  };

  return (
    <div className="max-w-[1000px] mx-auto space-y-8 animate-in fade-in duration-500 p-8">
      <div>
        <h2 className="text-3xl font-black text-brand-ice tracking-tight">
          {copy("AI Knowledge Base")}
        </h2>
        <p className="text-brand-ice/60 font-medium mt-1">
          {copy(
            "Upload PDFs containing your pricing, doctor CVs, and FAQs to train your AI agent.",
          )}
        </p>
      </div>

      {/* Upload Zone */}
      <Card className="shadow-none shadow-none border-white/10 rounded-2xl overflow-hidden">
        <CardHeader className="bg-brand-navy/50 border-b border-white/10 pb-6">
          <CardTitle className="flex items-center text-lg font-bold text-brand-ice/80">
            <UploadCloud className="me-2 h-5 w-5 text-indigo-500" />
            {copy("Upload Document")}
          </CardTitle>
          <CardDescription className="font-medium">
            {copy("Supported formats: Strictly PDF only. Max size: 10MB.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-8">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() =>
              !uploadMutation.isPending && fileInputRef.current?.click()
            }
            className={`
              relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200
              ${isDragging ? "border-indigo-500 bg-brand-electric/10/50 scale-[1.02]" : "border-white/10 hover:border-indigo-300 hover:bg-brand-navy"}
              ${uploadMutation.isPending ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileChange}
              disabled={uploadMutation.isPending}
            />

            <div className="h-16 w-16 bg-transparent shadow-none border border-white/10 rounded-2xl flex items-center justify-center text-indigo-500 mb-4 transition-transform group-hover:scale-110">
              {uploadMutation.isPending ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : (
                <FilePlus className="h-8 w-8" />
              )}
            </div>

            {uploadMutation.isPending ? (
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-indigo-600">
                  {copy("Uploading & Vectorizing...")}
                </p>
                <p className="text-xs font-medium text-brand-ice/60">
                  {copy("This may take a few moments")}
                </p>
              </div>
            ) : (
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-brand-ice/80">
                  <span className="text-indigo-600">
                    {copy("Click to upload")}
                  </span>
                  {copy("or drag and drop")}
                </p>
                <p className="text-xs font-medium text-brand-ice/60">
                  {copy("PDF documents up to 10MB")}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      <Card className="shadow-none shadow-none border-white/10 rounded-2xl overflow-hidden">
        <CardHeader className="bg-brand-navy/50 border-b border-white/10 py-5">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center text-lg font-bold text-brand-ice/80">
              <FileText className="me-2 h-5 w-5 text-indigo-500" />
              {copy("Knowledge Base Documents")}
            </CardTitle>
            <Badge className="bg-transparent text-brand-ice/60 border-white/10 shadow-none font-black px-3 py-1">
              {(documents as unknown[])?.length || 0}
              {copy("Files")}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-brand-navy/30 hover:bg-brand-navy/30 border-b border-white/10">
                <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-12 ps-6">
                  {copy("File Name")}
                </TableHead>
                <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-12">
                  {copy("Upload Date")}
                </TableHead>
                <TableHead className="font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-12">
                  {copy("Status")}
                </TableHead>
                <TableHead className="text-end font-bold text-[11px] uppercase tracking-widest text-brand-ice/60 h-12 pe-6">
                  {copy("Actions")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
                      <span className="text-xs font-bold text-brand-ice/60 uppercase tracking-widest">
                        {copy("Loading documents...")}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : !documents || (documents as unknown[]).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-40 text-center">
                    <p className="text-sm font-medium text-brand-ice/60">
                      {copy("No documents found.")}
                    </p>
                    <p className="text-xs text-brand-ice/60 mt-1">
                      {copy("Upload a PDF above to get started.")}
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                (
                  documents as {
                    id: string;
                    fileName: string;
                    createdAt: string;
                    status: string;
                  }[]
                ).map((doc) => (
                  <TableRow
                    key={doc.id}
                    className="hover:bg-brand-navy/80 transition-colors"
                  >
                    <TableCell className="ps-6">
                      <div className="flex items-center space-x-3">
                        <div className="h-9 w-9 rounded-lg bg-brand-electric/10 flex items-center justify-center text-indigo-500">
                          <FileText size={18} />
                        </div>
                        <span className="font-bold text-brand-ice/80 text-sm">
                          {doc.fileName}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-medium text-brand-ice/60">
                        {new Date(doc.createdAt).toLocaleDateString(locale, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </TableCell>
                    <TableCell>
                      {doc.status === "PROCESSED" && (
                        <Badge
                          variant="outline"
                          className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-none font-bold text-[10px]"
                        >
                          <CheckCircle2 className="w-3 h-3 me-1" />
                          {copy("PROCESSED")}
                        </Badge>
                      )}
                      {doc.status === "PENDING" && (
                        <Badge
                          variant="outline"
                          className="bg-amber-500/20 text-amber-400 border-amber-500/20 shadow-none font-bold text-[10px]"
                        >
                          <Loader2 className="w-3 h-3 me-1 animate-spin" />
                          {copy("PENDING")}
                        </Badge>
                      )}
                      {doc.status === "ERROR" && (
                        <Badge
                          variant="outline"
                          className="bg-red-500/10 text-red-400 border-red-500/20 shadow-none font-bold text-[10px]"
                        >
                          <AlertCircle className="w-3 h-3 me-1" />
                          {copy("ERROR")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-end pe-6">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDocumentToDelete(doc.id)}
                        className="text-brand-ice/60 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!documentToDelete}
        onOpenChange={(open) => !open && setDocumentToDelete(null)}
      >
        <DialogContent className="sm:max-w-[400px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden">
          <DialogHeader className="p-6 bg-brand-navy border-b border-white/10">
            <div className="flex items-center space-x-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
                <AlertCircle size={20} />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold text-brand-ice">
                  {copy("Delete Document")}
                </DialogTitle>
                <DialogDescription className="text-brand-ice/60 font-medium">
                  {copy("This action cannot be undone.")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="p-6">
            <p className="text-sm font-medium text-brand-ice/80">
              {copy(
                "Are you sure you want to delete this document? All associated AI training data and vectors will be permanently removed.",
              )}
            </p>
          </div>
          <DialogFooter className="p-6 pt-4 border-t border-white/10 bg-brand-navy">
            <div className="flex items-center justify-end w-full space-x-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDocumentToDelete(null)}
                className="h-10 px-4 rounded-xl font-bold border-white/10"
                disabled={deleteMutation.isPending}
              >
                {copy("Cancel")}
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmDelete}
                className="h-10 px-6 rounded-xl font-bold shadow-lg shadow-red-500/20 transition-all active:scale-95"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="me-2 h-4 w-4" />
                )}
                {copy("Delete Document")}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
