import { FileText, Lightbulb } from "lucide-react";

interface RecommendedReadingItem {
  title: string;
  subtitle: string;
  type: 'read' | 'more';
}

interface RecommendedReadingProps {
  items: RecommendedReadingItem[];
}

export function RecommendedReading({ items }: RecommendedReadingProps) {
  return (
    <div className="mt-8 pt-8 border-t border-border">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-xl font-semibold text-foreground">Related content</h3>
        <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
          <span className="text-xs text-muted-foreground font-medium">i</span>
        </div>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-3 p-4 border border-border rounded-lg bg-card hover:bg-muted/20 transition-colors cursor-pointer">
            <div className="flex-shrink-0">
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground truncate">{item.title}</h4>
              <p className="text-sm text-muted-foreground truncate">{item.subtitle}</p>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Lightbulb className="h-4 w-4" />
              <span className="text-sm">{item.type === 'read' ? 'Read with this' : 'More like this'}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}