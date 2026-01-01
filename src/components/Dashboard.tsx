import { CompanyNoticeboard } from "./CompanyNoticeboard";

interface DashboardProps {
  onCreatePage: () => void;
  onPageSelect: (pageId: string) => void;
}

export function Dashboard({ onCreatePage, onPageSelect }: DashboardProps) {
  return (
    <div className="flex-1 overflow-auto bg-gradient-subtle">
      <div className="max-w-4xl mx-auto p-6">
        <CompanyNoticeboard />
      </div>
    </div>
  );
}
