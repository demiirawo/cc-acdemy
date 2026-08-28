import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FileSignature, Loader2, PenLine } from "lucide-react";
import { ContractStatusBadge, formatDateTime } from "./contractStatus";

interface MyContract {
  id: string;
  title: string;
  body_html: string;
  status: string;
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signature_image_url: string | null;
}

export function MyContracts() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<MyContract[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    // Filtered by recipient explicitly. For staff, RLS already allows nothing
    // else — but an admin's policy covers every contract, so without this the
    // page would quietly show them the whole company's and offer a signature
    // box on somebody else's agreement.
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, title, body_html, status, sent_at, viewed_at, signed_at, signed_name, signature_image_url"
      )
      .eq("recipient_user_id", user.id)
      .order("sent_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load your contracts", description: error.message, variant: "destructive" });
    } else {
      setContracts((data ?? []) as MyContract[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Contracts open on their own page — a dialog is too small a container for a
  // twenty-two clause agreement somebody is being asked to read carefully.
  const open = (c: MyContract) => navigate(`/contract/${c.id}`);

  const visible = contracts.filter((c) => c.status !== "cancelled");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">My Contracts</h2>
        <p className="text-sm text-muted-foreground">
          Review and sign contracts sent to you by Care Cuddle Academy.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No contracts yet</p>
            <p className="text-sm text-muted-foreground">
              When an admin sends you a contract it will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {visible.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{c.title}</p>
                    <ContractStatusBadge status={c.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Sent {formatDateTime(c.sent_at)}
                    {c.signed_at ? ` · Signed ${formatDateTime(c.signed_at)}` : ""}
                  </p>
                </div>
                <Button
                  variant={c.status === "signed" ? "outline" : "default"}
                  onClick={() => open(c)}
                >
                  {c.status === "signed" ? (
                    "View"
                  ) : (
                    <>
                      <PenLine className="mr-1.5 h-4 w-4" /> Review &amp; sign
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}
