import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2 } from "lucide-react";
import { ContractDocument } from "./ContractDocument";
import { ContractStatusBadge, formatDateTime } from "./contractStatus";
import { SignaturePad, SignaturePadHandle } from "./SignaturePad";

interface Contract {
  id: string;
  title: string;
  body_html: string;
  status: string;
  sent_at: string;
  viewed_at: string | null;
  signed_at: string | null;
  signed_name: string | null;
  signature_image_url: string | null;
  recipient_user_id: string | null;
  recipient_name: string | null;
}

/**
 * A contract on its own page rather than inside a dialog.
 *
 * A dialog is the wrong container for a twenty-two clause agreement: it caps
 * out at a fraction of the window, so the thing someone is being asked to read
 * carefully arrives in a letterbox. On its own page it gets the full width, the
 * browser's own scrolling and find-in-page, and a URL that can be sent to
 * somebody.
 *
 * Access is left to the database — staff can read only their own row, admins
 * can read all — so a link to a contract that is not yours simply finds
 * nothing, whether it was guessed or forwarded.
 */
export function ContractPage() {
  const { contractId } = useParams<{ contractId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [sigEmpty, setSigEmpty] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const padRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    if (!contractId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, body_html, status, sent_at, viewed_at, signed_at, signed_name, signature_image_url, recipient_user_id, recipient_name")
        .eq("id", contractId)
        .maybeSingle();
      if (error) {
        toast({ title: "Could not open that contract", description: error.message, variant: "destructive" });
      } else if (data) {
        setContract(data as Contract);
        setSignedName((data as Contract).signed_name || "");
        // Reading it counts as viewing it, but only for the person it is for.
        if (data.status === "sent" && data.recipient_user_id === user?.id) {
          await supabase.rpc("mark_contract_viewed", { _contract_id: data.id });
          setContract((c) => (c ? { ...c, status: "viewed", viewed_at: new Date().toISOString() } : c));
        }
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, user?.id]);

  const isMine = !!contract && contract.recipient_user_id === user?.id;
  const isSignable = isMine && (contract?.status === "sent" || contract?.status === "viewed");

  const sign = async () => {
    if (!contract) return;
    if (!signedName.trim()) return toast({ title: "Type your full name", variant: "destructive" });
    if (sigEmpty) return toast({ title: "Please draw your signature", variant: "destructive" });
    if (!agreed) return toast({ title: "Please confirm you agree to the terms", variant: "destructive" });

    setSubmitting(true);
    try {
      // The drawn signature goes into the signer's own folder in a private
      // bucket; only the storage path is kept, and it is read back through a
      // short-lived signed URL.
      let signaturePath: string | null = null;
      const dataUrl = padRef.current?.toDataURL();
      if (dataUrl) {
        const blob = await (await fetch(dataUrl)).blob();
        const path = `${user?.id}/${contract.id}-${Date.now()}.png`;
        const { error: upErr } = await supabase.storage
          .from("contract-signatures")
          .upload(path, blob, { contentType: "image/png", upsert: true });
        if (upErr) throw upErr;
        signaturePath = path;
      }

      const { data, error } = await supabase.rpc("sign_contract", {
        _contract_id: contract.id,
        _signed_name: signedName.trim(),
        _signature_image_url: signaturePath,
        _signature_ip: null,
      });
      if (error) throw error;

      try {
        await supabase.functions.invoke("send-contract-email", {
          body: {
            type: "contract_signed",
            contractId: contract.id,
            contractTitle: contract.title,
            recipientName: signedName.trim(),
          },
        });
      } catch (e) {
        console.error("contract signed email failed", e);
      }

      const signed = (Array.isArray(data) ? data[0] : data) as Contract;
      setContract(signed ?? contract);
      toast({ title: "Contract signed", description: "Thank you — a copy is saved to your record." });
    } catch (e) {
      toast({ title: "Could not sign", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading the contract…
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="mx-auto max-w-lg space-y-4 px-4 py-24 text-center">
        <h1 className="text-xl font-semibold">Contract not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been withdrawn, or it may belong to somebody else.
        </p>
        <Button variant="outline" onClick={() => navigate("/view/hr?tab=my-contracts")}>
          Back to contracts
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 pb-24">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center gap-3 px-4 py-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/view/hr?tab=my-contracts")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Contracts
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold">{contract.title}</h1>
            <p className="truncate text-xs text-muted-foreground">
              {contract.recipient_name}
              {contract.signed_at
                ? ` · Signed ${formatDateTime(contract.signed_at)}`
                : ` · Sent ${formatDateTime(contract.sent_at)}`}
            </p>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>
      </div>

      <div className="mx-auto max-w-[900px] px-4 py-8">
        <ContractDocument
          bodyHtml={contract.body_html}
          signedName={contract.signed_name}
          signatureImageUrl={contract.signature_image_url}
          signedAt={contract.signed_at}
        />

        {isSignable && (
          <div className="mx-auto mt-6 max-w-[794px] space-y-4 rounded-lg border bg-card p-6">
            <div>
              <h2 className="text-base font-semibold">Sign this contract</h2>
              <p className="text-sm text-muted-foreground">
                Read the whole agreement above before signing. Once signed it cannot be changed.
              </p>
            </div>
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
              <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
              <span>
                I confirm that I have read, understood and agree to the terms of this contract, and
                that my typed name and drawn signature constitute my legal signature.
              </span>
            </label>
            <Button onClick={sign} disabled={submitting} className="w-full sm:w-auto">
              {submitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Sign contract
            </Button>
          </div>
        )}

        {!isMine && !contract.signed_at && (
          <p className="mx-auto mt-6 max-w-[794px] text-sm text-muted-foreground">
            This contract is {contract.recipient_name}&rsquo;s to sign — you are viewing it as an admin.
          </p>
        )}
      </div>
    </div>
  );
}
