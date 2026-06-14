import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FileSignature, Loader2, PenLine } from "lucide-react";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";
import { ContractDocument } from "./ContractDocument";
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
  const [contracts, setContracts] = useState<MyContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<MyContract | null>(null);
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("contracts")
      .select(
        "id, title, body_html, status, sent_at, viewed_at, signed_at, signed_name, signature_image_url"
      )
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
  }, []);

  const open = async (c: MyContract) => {
    setActive(c);
    setSignedName(c.signed_name || "");
    setAgreed(false);
    setSigEmpty(true);
    // Mark as viewed (no-op server-side unless still in 'sent').
    if (c.status === "sent") {
      await supabase.rpc("mark_contract_viewed", { _contract_id: c.id });
      setContracts((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, status: "viewed", viewed_at: new Date().toISOString() } : x))
      );
    }
  };

  const sign = async () => {
    if (!active) return;
    if (!signedName.trim()) {
      toast({ title: "Type your full name", variant: "destructive" });
      return;
    }
    if (sigEmpty) {
      toast({ title: "Please draw your signature", variant: "destructive" });
      return;
    }
    if (!agreed) {
      toast({ title: "Please confirm you agree to the terms", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      // Upload the drawn signature image into the user's own folder.
      // We store the storage *path* (not a public URL) — the bucket is private
      // and the image is shown via a short-lived signed URL on read.
      let signaturePath: string | null = null;
      const dataUrl = padRef.current?.toDataURL();
      if (dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const path = `${user?.id}/${active.id}-${Date.now()}.png`;
        const { error: upErr } = await supabase.storage
          .from("contract-signatures")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (upErr) throw upErr;
        signaturePath = path;
      }

      const { data, error } = await supabase.rpc("sign_contract", {
        _contract_id: active.id,
        _signed_name: signedName.trim(),
        _signature_image_url: signaturePath,
        _signature_ip: null,
      });
      if (error) throw error;

      // Notify admins of the signature.
      try {
        await supabase.functions.invoke("send-contract-email", {
          body: {
            type: "contract_signed",
            contractId: active.id,
            contractTitle: active.title,
            recipientName: signedName.trim(),
          },
        });
      } catch (e) {
        console.error("contract signed email failed", e);
      }

      const signed = (Array.isArray(data) ? data[0] : data) as MyContract;
      toast({ title: "Contract signed", description: "Thank you — a copy is saved to your record." });
      setActive(signed ?? null);
      load();
    } catch (e: any) {
      toast({ title: "Could not sign", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const visible = contracts.filter((c) => c.status !== "cancelled");
  const isSignable = active && (active.status === "sent" || active.status === "viewed");

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

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{active?.title}</DialogTitle>
            <DialogDescription>
              {isSignable
                ? "Read the full contract, then sign at the bottom to accept."
                : "This contract has been signed."}
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <ContractDocument
                bodyHtml={active.body_html}
                signedName={active.status === "signed" ? active.signed_name : undefined}
                signatureImageUrl={active.status === "signed" ? active.signature_image_url : undefined}
                signedAt={active.status === "signed" ? active.signed_at : undefined}
              />

              {isSignable && (
                <div className="mt-5 space-y-4 rounded-md border bg-muted/30 p-4">
                  <h3 className="font-medium">Sign this contract</h3>
                  <div className="grid gap-1.5">
                    <Label htmlFor="legal-name">Full legal name</Label>
                    <Input
                      id="legal-name"
                      value={signedName}
                      onChange={(e) => setSignedName(e.target.value)}
                      placeholder="Type your full legal name"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label>Signature</Label>
                    <SignaturePad ref={padRef} onChange={setSigEmpty} />
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <Checkbox
                      checked={agreed}
                      onCheckedChange={(v) => setAgreed(v === true)}
                      className="mt-0.5"
                    />
                    <span>
                      I confirm that I have read, understood and agree to the terms of this contract,
                      and that my typed name and drawn signature constitute my legal signature.
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {isSignable && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setActive(null)} disabled={submitting}>
                Close
              </Button>
              <Button onClick={sign} disabled={submitting}>
                {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Sign contract
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
