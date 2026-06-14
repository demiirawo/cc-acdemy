import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileSignature, Plus, Eye, Ban, Loader2, FileText } from "lucide-react";
import { SendContractDialog } from "./SendContractDialog";
import { ContractDocument } from "./ContractDocument";
import { ContractStatusBadge, formatDateTime } from "./contractStatus";

interface ContractRow {
  id: string;
  title: string;
  body_html: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: string;
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signature_image_url: string | null;
}

export function ContractsManager() {
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [viewing, setViewing] = useState<ContractRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<ContractRow | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, title, body_html, recipient_name, recipient_email, status, sent_at, viewed_at, signed_at, signed_name, signature_image_url"
      )
      .order("sent_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load contracts", description: error.message, variant: "destructive" });
    } else {
      setContracts((data ?? []) as ContractRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const cancel = async () => {
    if (!cancelTarget) return;
    const { error } = await supabase
      .from("contracts")
      .update({ status: "cancelled" })
      .eq("id", cancelTarget.id);
    if (error) {
      toast({ title: "Cancel failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contract cancelled" });
      load();
    }
    setCancelTarget(null);
  };

  const signedCount = contracts.filter((c) => c.status === "signed").length;
  const pendingCount = contracts.filter((c) => c.status === "sent" || c.status === "viewed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sent Contracts</h2>
          <p className="text-sm text-muted-foreground">
            Track signature progress across your team.
          </p>
        </div>
        <Button onClick={() => setSendOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Send Contract
        </Button>
      </div>

      {!loading && contracts.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card><CardContent className="py-4">
            <p className="text-2xl font-bold">{contracts.length}</p>
            <p className="text-xs text-muted-foreground">Total sent</p>
          </CardContent></Card>
          <Card><CardContent className="py-4">
            <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Awaiting signature</p>
          </CardContent></Card>
          <Card><CardContent className="py-4">
            <p className="text-2xl font-bold text-green-600">{signedCount}</p>
            <p className="text-xs text-muted-foreground">Signed</p>
          </CardContent></Card>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading contracts…
        </div>
      ) : contracts.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <FileSignature className="h-10 w-10 text-muted-foreground" />
            <div>
              <p className="font-medium">No contracts sent yet</p>
              <p className="text-sm text-muted-foreground">
                Send a contract to a staff member to start tracking signatures.
              </p>
            </div>
            <Button onClick={() => setSendOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Send Contract
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Viewed</TableHead>
                  <TableHead>Signed</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.recipient_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{c.recipient_email}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">{c.title}</TableCell>
                    <TableCell><ContractStatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(c.sent_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(c.viewed_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(c.signed_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setViewing(c)} title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(c.status === "sent" || c.status === "viewed") && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCancelTarget(c)}
                            title="Cancel"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <SendContractDialog open={sendOpen} onOpenChange={setSendOpen} onSent={load} />

      {/* View contract dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {viewing?.title}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="max-h-[70vh] overflow-y-auto">
              <ContractDocument
                bodyHtml={viewing.body_html}
                signedName={viewing.signed_name}
                signatureImageUrl={viewing.signature_image_url}
                signedAt={viewing.signed_at}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this contract?</AlertDialogTitle>
            <AlertDialogDescription>
              "{cancelTarget?.title}" for {cancelTarget?.recipient_name} will be marked cancelled and
              the recipient will no longer be able to sign it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={cancel}>Cancel contract</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
