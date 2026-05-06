'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useDocumentsControllerGetDocuments,
  useDocumentsControllerUploadDocument,
  useDocumentsControllerDeleteDocument
} from '@/lib/api/generated/documents/documents';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FileText, UploadCloud, Trash2, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';

export default function DocumentsSettingsPage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 1. Fetch Documents
  const { data: documents = [], refetch } = useDocumentsControllerGetDocuments();

  // 2. Mutations
  const uploadMutation = useDocumentsControllerUploadDocument();
  const deleteMutation = useDocumentsControllerDeleteDocument();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    // Orval expects formData for binary uploads
    const formData = new FormData();
    formData.append('file', file);

    uploadMutation.mutate(
      { data: { file: file as any } }, // Adjust this based on exactly how Orval types the mutation
      {
        onSuccess: () => {
          setFile(null);
          refetch(); // Refresh the list
        },
        onError: (err) => {
          console.error('Upload failed', err);
          alert("Failed to upload and process document.");
        }
      }
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure? This will delete the AI knowledge base vectors.')) return;
    
    deleteMutation.mutate(
      { id },
      {
        onSuccess: () => refetch(),
      }
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">AI Knowledge Base</h2>
        <p className="text-muted-foreground">Upload PDFs containing your prices, policies, and clinic details to train your AI agent.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Document</CardTitle>
          <CardDescription>Supported formats: PDF. Max size: 10MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4 border-2 border-dashed border-slate-200 rounded-lg p-6 bg-slate-50 justify-center">
            <Input 
              type="file" 
              accept=".pdf" 
              onChange={handleFileChange} 
              className="max-w-xs cursor-pointer"
            />
            <Button 
              onClick={handleUpload} 
              disabled={!file || uploadMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {uploadMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
              {uploadMutation.isPending ? 'Vectorizing in Python...' : 'Upload & Train'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {documents.length === 0 && <p className="text-sm text-slate-500">No documents uploaded yet.</p>}
            
            {documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg bg-white">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                    <FileText size={24} />
                  </div>
                  <div>
                    <h4 className="font-medium text-sm">{doc.fileName}</h4>
                    <p className="text-xs text-slate-500">Uploaded: {new Date(doc.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  {doc.status === 'PROCESSED' && (
                    <span className="flex items-center text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle2 size={12} className="mr-1" /> Active in AI
                    </span>
                  )}
                  {doc.status === 'ERROR' && (
                    <span className="flex items-center text-xs text-red-600 bg-red-50 px-2 py-1 rounded-full">
                      <AlertCircle size={12} className="mr-1" /> Failed
                    </span>
                  )}
                  {doc.status === 'PENDING' && (
                    <span className="flex items-center text-xs text-yellow-600 bg-yellow-50 px-2 py-1 rounded-full">
                      <Loader2 size={12} className="mr-1 animate-spin" /> Processing
                    </span>
                  )}
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 size={18} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}