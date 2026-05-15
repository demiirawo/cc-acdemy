import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plus, BarChart3, Pencil, Trash2 } from "lucide-react";
import type { RecruitmentTest } from "./types";

interface Props {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onResults: (id: string) => void;
}

export function TestsList({ onCreate, onEdit, onResults }: Props) {
  const [tests, setTests] = useState<RecruitmentTest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recruitment_tests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error loading tests", description: error.message, variant: "destructive" });
    } else {
      setTests((data || []) as RecruitmentTest[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/apply/${slug}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied", description: url });
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this test and all results? This cannot be undone.")) return;
    const { error } = await supabase.from("recruitment_tests").delete().eq("id", id);
    if (error) toast({ title: "Delete failed", description: error.message, variant: "destructive" });
    else load();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recruitment Tests</h1>
          <p className="text-muted-foreground text-sm">Create candidate evaluation tests with anti-cheat monitoring.</p>
        </div>
        <Button onClick={onCreate}><Plus className="h-4 w-4 mr-2" />New Test</Button>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : tests.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground mb-4">No tests yet.</p>
          <Button onClick={onCreate}><Plus className="h-4 w-4 mr-2" />Create your first test</Button>
        </Card>
      ) : (
        <div className="grid gap-3">
          {tests.map((t) => (
            <Card key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold truncate">{t.title}</h3>
                  <Badge variant={t.status === "live" ? "default" : t.status === "draft" ? "secondary" : "outline"}>
                    {t.status}
                  </Badge>
                </div>
                {t.role && <p className="text-sm text-muted-foreground">{t.role}</p>}
                <p className="text-xs text-muted-foreground mt-1 font-mono truncate">/apply/{t.slug}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => copyLink(t.slug)}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy link</Button>
                <Button size="sm" variant="outline" onClick={() => onResults(t.id)}><BarChart3 className="h-3.5 w-3.5 mr-1.5" />Results</Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(t.id)}><Pencil className="h-3.5 w-3.5 mr-1.5" />Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
