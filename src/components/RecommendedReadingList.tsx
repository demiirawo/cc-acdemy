import { FileText } from "lucide-react";

interface RecommendedReadingItem {
  title: string;
  description: string;
  type: 'document' | 'guide' | 'reference';
}

interface RecommendedReadingListProps {
  items: RecommendedReadingItem[];
}

export function RecommendedReadingList({ items }: RecommendedReadingListProps) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-md border border-border/50">
          <div className="flex-shrink-0 mt-0.5">
            <FileText className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-foreground text-sm">{item.title}</h4>
            <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}