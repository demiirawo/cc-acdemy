import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Download, ExternalLink, FileText, Image as ImageIcon, Loader2 } from "lucide-react";

interface DocumentPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string | null;
  documentType: string;
  documentLabel: string;
}

export function DocumentPreviewDialog({
  open,
  onOpenChange,
  filePath,
  documentType,
  documentLabel
}: DocumentPreviewDialogProps) {
  const [loading, setLoading] = useState(false);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && filePath) {
      fetchFileUrl();
    } else {
      setFileUrl(null);
      setError(null);
    }
  }, [open, filePath]);

  const fetchFileUrl = async () => {
    if (!filePath) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: signedUrlError } = await supabase.storage
        .from('onboarding-documents')
        .createSignedUrl(filePath, 3600); // 1 hour expiry
      
      if (signedUrlError) {
        console.error('Error getting signed URL:', signedUrlError);
        setError('Unable to load document');
        return;
      }
      
      // The signedUrl might be a relative path, so we need to construct the full URL
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pavwwgfgpykakbqkxsal.supabase.co';
      const fullUrl = data.signedUrl.startsWith('http') 
        ? data.signedUrl 
        : `${supabaseUrl}/storage/v1${data.signedUrl}`;
      
      setFileUrl(fullUrl);
    } catch (err) {
      console.error('Error fetching file:', err);
      setError('Unable to load document');
    } finally {
      setLoading(false);
    }
  };

  const getFileExtension = (path: string | null): string => {
    if (!path) return '';
    const parts = path.split('.');
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
  };

  const isImage = (path: string | null): boolean => {
    const ext = getFileExtension(path);
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext);
  };

  const isPdf = (path: string | null): boolean => {
    return getFileExtension(path) === 'pdf';
  };

  const handleDownload = () => {
    if (fileUrl) {
      window.open(fileUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isImage(filePath) ? (
              <ImageIcon className="h-5 w-5" />
            ) : (
              <FileText className="h-5 w-5" />
            )}
            {documentLabel} - {documentType}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-auto min-h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
              <FileText className="h-16 w-16" />
              <p>{error}</p>
              <Button variant="outline" onClick={fetchFileUrl}>
                Try Again
              </Button>
            </div>
          ) : fileUrl ? (
            <div className="h-full">
              {isImage(filePath) ? (
                <div className="flex items-center justify-center p-4">
                  <img 
                    src={fileUrl} 
                    alt={documentLabel}
                    className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-lg"
                  />
                </div>
              ) : isPdf(filePath) ? (
                <iframe
                  src={fileUrl}
                  className="w-full h-[60vh] border-0 rounded-lg"
                  title={documentLabel}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                  <FileText className="h-16 w-16" />
                  <p className="text-center">
                    This file type ({getFileExtension(filePath).toUpperCase()}) cannot be previewed directly.
                  </p>
                  <Button onClick={handleDownload}>
                    <Download className="h-4 w-4 mr-2" />
                    Download File
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>No document available</p>
            </div>
          )}
        </div>
        
        {fileUrl && !error && (
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={handleDownload}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Open in New Tab
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
