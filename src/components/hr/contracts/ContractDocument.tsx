import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "./contractStatus";

/** Matches the handwriting stack the Company's signature uses in the body. */
const SIGNATURE_FONT = '"Segoe Script", "Brush Script MT", "Snell Roundhand", cursive';

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
    <div className="mx-auto w-full max-w-[794px] rounded-md border bg-white px-8 py-10 text-[15px] leading-relaxed text-foreground shadow-sm sm:px-14 sm:py-16">
      <div
        className="cc-rich max-w-none"
        dangerouslySetInnerHTML={{ __html: bodyHtml }}
      />
      {/* The Contractor's side of the signature block. The body above ends with
          "Signed by the Contractor", so this continues the document rather than
          announcing itself — same layout as the Company's signature, so the two
          read as one execution block whichever way round they were added. */}
      {signedName || signatureImageUrl ? (
        <div className="mt-2">
          {sigSrc ? (
            <img src={sigSrc} alt={`Signature of ${signedName ?? "the Contractor"}`} className="mb-1 max-h-20" />
          ) : (
            <p className="text-[30px] leading-tight" style={{ fontFamily: SIGNATURE_FONT }}>
              {signedName}
            </p>
          )}
          <div className="max-w-[280px] border-t pt-1.5">
            <p>{signedName}</p>
            <p className="text-sm text-muted-foreground">Signed {formatDateTime(signedAt)}</p>
          </div>
        </div>
      ) : (
        <div className="mt-2">
          <div className="h-12" />
          <div className="max-w-[280px] border-t pt-1.5">
            <p className="text-muted-foreground">Not yet signed</p>
          </div>
        </div>
      )}
    </div>
  );
}
