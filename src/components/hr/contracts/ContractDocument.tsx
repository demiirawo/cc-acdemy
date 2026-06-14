import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "./contractStatus";

interface ContractDocumentProps {
  bodyHtml: string;
  signedName?: string | null;
  /** Storage path within the private `contract-signatures` bucket. */
  signatureImageUrl?: string | null;
  signedAt?: string | null;
}

/** Renders a contract's HTML body, plus a signature block when signed. */
export function ContractDocument({
  bodyHtml,
  signedName,
  signatureImageUrl,
  signedAt,
}: ContractDocumentProps) {
  const [sigSrc, setSigSrc] = useState<string | null>(null);

  // The signature lives in a private bucket — resolve a short-lived signed URL.
  // Tolerates older rows that stored a full URL.
  useEffect(() => {
    let cancelled = false;
    if (!signatureImageUrl) {
      setSigSrc(null);
      return;
    }
    if (/^https?:\/\//.test(signatureImageUrl)) {
      setSigSrc(signatureImageUrl);
      return;
    }
    supabase.storage
      .from("contract-signatures")
      .createSignedUrl(signatureImageUrl, 3600)
      .then(({ data }) => {
        if (!cancelled) setSigSrc(data?.signedUrl ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [signatureImageUrl]);

  return (
    <div className="rounded-md border bg-white p-6 text-foreground shadow-sm">
      <div
        className="cc-rich max-w-none"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {(signedName || signatureImageUrl) && (
        <div className="mt-8 border-t pt-6">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Signed by</p>
          {sigSrc && (
            <img
              src={sigSrc}
              alt="Signature"
              className="mb-2 max-h-24 rounded border bg-white p-1"
            />
          )}
          <p className="text-lg font-semibold" style={{ fontFamily: "cursive" }}>
            {signedName}
          </p>
          <p className="text-xs text-muted-foreground">Signed on {formatDateTime(signedAt)}</p>
        </div>
      )}
    </div>
  );
}
