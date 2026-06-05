import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface VoiceNoteRecorderProps {
  value: string | null;
  onChange: (url: string | null) => void;
}

const BUCKET = "onboarding-voice-notes";

export function VoiceNoteRecorder({ value, onChange }: VoiceNoteRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<number | null>(null);
  const { toast } = useToast();

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        if (pendingUrl) URL.revokeObjectURL(pendingUrl);
        setPendingBlob(blob);
        setPendingUrl(URL.createObjectURL(blob));
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    } catch (err) {
      console.error(err);
      toast({ title: "Microphone access denied", description: "Please allow microphone access to record.", variant: "destructive" });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const uploadPending = async () => {
    if (!pendingBlob) return;
    setUploading(true);
    try {
      const ext = pendingBlob.type.includes("mp4") ? "m4a" : "webm";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, pendingBlob, {
        contentType: pendingBlob.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
      onChange(data.publicUrl);
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      setPendingBlob(null);
      setPendingUrl(null);
      toast({ title: "Voice note saved" });
    } catch (err: any) {
      console.error(err);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const removeSaved = async () => {
    if (!value) return;
    // Try to delete from storage (best effort)
    try {
      const url = new URL(value);
      const idx = url.pathname.indexOf(`/${BUCKET}/`);
      if (idx !== -1) {
        const path = url.pathname.slice(idx + BUCKET.length + 2);
        await supabase.storage.from(BUCKET).remove([decodeURIComponent(path)]);
      }
    } catch (e) {
      console.warn("Could not delete file from storage", e);
    }
    onChange(null);
  };

  const discardPending = () => {
    if (pendingUrl) URL.revokeObjectURL(pendingUrl);
    setPendingBlob(null);
    setPendingUrl(null);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-2 rounded-lg border p-3 bg-muted/30">
      {value && !pendingUrl && (
        <div className="flex items-center gap-2">
          <audio src={value} controls className="flex-1 h-10" />
          <Button type="button" variant="ghost" size="sm" onClick={removeSaved} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}

      {pendingUrl && (
        <div className="space-y-2">
          <audio src={pendingUrl} controls className="w-full h-10" />
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={uploadPending} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Save voice note
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={discardPending} disabled={uploading}>
              Discard
            </Button>
          </div>
        </div>
      )}

      {!pendingUrl && (
        <div className="flex items-center gap-2">
          {!recording ? (
            <Button type="button" size="sm" variant="outline" onClick={startRecording}>
              <Mic className="h-4 w-4 mr-2" />
              {value ? "Re-record" : "Record voice note"}
            </Button>
          ) : (
            <Button type="button" size="sm" variant="destructive" onClick={stopRecording}>
              <Square className="h-4 w-4 mr-2" />
              Stop ({formatTime(elapsed)})
            </Button>
          )}
          {recording && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              Recording…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
