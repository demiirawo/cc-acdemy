import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, HelpCircle, Check, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface Comment {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_name: string;
  content: string;
  is_clarification_request: boolean;
  resolved: boolean;
  created_at: string;
}

interface Props {
  taskId: string;
  taskName: string;
  /** Whether to show the count badge inline next to the icon */
  compact?: boolean;
}

export function HandoverTaskComments({ taskId, taskName, compact = true }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [isClarification, setIsClarification] = useState(false);
  const [me, setMe] = useState<{ id: string | null; name: string }>({ id: null, name: "" });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (active) setMe({ id: null, name: "Guest" });
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("display_name, email")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      setMe({
        id: user.id,
        name: (prof?.display_name || prof?.email || user.email || "User").trim(),
      });
    })();
    return () => { active = false; };
  }, []);

  const { data: comments = [] } = useQuery({
    queryKey: ["handover-task-comments", taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_handover_task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as Comment[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["handover-task-comments", taskId] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const content = draft.trim();
      if (!content) throw new Error("Empty comment");
      const { error } = await supabase
        .from("client_handover_task_comments")
        .insert({
          task_id: taskId,
          author_user_id: me.id,
          author_name: me.name || "User",
          content,
          is_clarification_request: isClarification,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      setDraft("");
      setIsClarification(false);
      invalidate();
      toast.success("Comment added");
    },
    onError: (e: any) => toast.error(e?.message || "Failed to add comment"),
  });

  const toggleResolved = useMutation({
    mutationFn: async (c: Comment) => {
      const { error } = await supabase
        .from("client_handover_task_comments")
        .update({ resolved: !c.resolved })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("client_handover_task_comments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const unresolvedClarifications = comments.filter(c => c.is_clarification_request && !c.resolved).length;
  const total = comments.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={total === 0 ? "Add a comment" : `${total} comment${total === 1 ? "" : "s"}`}
          className={`relative inline-flex items-center gap-1 p-1 rounded transition ${
            unresolvedClarifications > 0
              ? "text-amber-600 hover:bg-amber-100"
              : total > 0
                ? "text-primary hover:bg-primary/10"
                : "opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          {unresolvedClarifications > 0 ? (
            <HelpCircle className="h-3.5 w-3.5" />
          ) : (
            <MessageSquare className="h-3.5 w-3.5" />
          )}
          {compact && total > 0 && (
            <span className="text-[10px] font-medium leading-none">{total}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="px-3 py-2 border-b border-border">
          <div className="text-xs text-muted-foreground">Comments on</div>
          <div className="text-sm font-medium truncate">{taskName}</div>
        </div>

        <div className="max-h-72 overflow-y-auto px-3 py-2 space-y-3">
          {comments.length === 0 ? (
            <div className="text-xs text-muted-foreground text-center py-6">
              No comments yet. Ask a question or leave a note for the team.
            </div>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className={`rounded-md border p-2 text-sm ${
                  c.is_clarification_request && !c.resolved
                    ? "border-amber-200 bg-amber-50"
                    : c.resolved
                      ? "border-emerald-200 bg-emerald-50/50"
                      : "border-border bg-muted/30"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-xs truncate">{c.author_name}</span>
                    {c.is_clarification_request && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] gap-1 border-amber-400 text-amber-700">
                        <HelpCircle className="h-2.5 w-2.5" /> Clarification
                      </Badge>
                    )}
                    {c.resolved && (
                      <Badge variant="outline" className="h-4 px-1 text-[10px] gap-1 border-emerald-400 text-emerald-700">
                        <Check className="h-2.5 w-2.5" /> Resolved
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-xs leading-relaxed">{c.content}</div>
                <div className="flex items-center justify-end gap-1 mt-1">
                  {c.is_clarification_request && (
                    <button
                      onClick={() => toggleResolved.mutate(c)}
                      className="text-[10px] text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-background"
                    >
                      {c.resolved ? "Reopen" : "Mark resolved"}
                    </button>
                  )}
                  {(me.id && c.author_user_id === me.id) && (
                    <button
                      onClick={() => { if (confirm("Delete this comment?")) deleteMutation.mutate(c.id); }}
                      className="text-[10px] text-muted-foreground hover:text-destructive p-0.5 rounded"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-border p-3 space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a comment or question…"
            className="min-h-[60px] text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={isClarification}
                onCheckedChange={(v) => setIsClarification(!!v)}
              />
              Request clarification
            </label>
            <Button
              size="sm"
              disabled={!draft.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate()}
            >
              Post
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Commenting as <span className="font-medium">{me.name || "…"}</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
