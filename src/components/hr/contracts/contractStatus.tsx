import { Badge } from "@/components/ui/badge";
import { Send, Eye, CheckCircle2, XCircle, Ban } from "lucide-react";

export type ContractStatus = "sent" | "viewed" | "signed" | "declined" | "cancelled";

const META: Record<
  ContractStatus,
  { label: string; className: string; Icon: typeof Send }
> = {
  sent: {
    label: "Sent",
    className: "bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200",
    Icon: Send,
  },
  viewed: {
    label: "Viewed",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200",
    Icon: Eye,
  },
  signed: {
    label: "Signed",
    className: "bg-green-100 text-green-700 hover:bg-green-100 border-green-200",
    Icon: CheckCircle2,
  },
  declined: {
    label: "Declined",
    className: "bg-red-100 text-red-700 hover:bg-red-100 border-red-200",
    Icon: XCircle,
  },
  cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-600 hover:bg-gray-100 border-gray-200",
    Icon: Ban,
  },
};

export function ContractStatusBadge({ status }: { status: string }) {
  const meta = META[(status as ContractStatus)] ?? META.sent;
  const { label, className, Icon } = meta;
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
