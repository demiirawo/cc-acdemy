import { GraduationCap } from "lucide-react";
import { TrainingMatrix } from "@/components/hr/training/TrainingMatrix";

// Public, read-only view of the staff training matrix (shared via "Copy public link").
// Data comes from column-scoped public sources; editing is disabled at both the UI
// and RLS layers.
export const PublicTrainingMatrix = () => (
  <div className="min-h-screen bg-background">
    <div className="p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Staff Training Matrix</h1>
            <p className="text-sm text-muted-foreground">Care Cuddle Academy · read-only view</p>
          </div>
        </div>
        <TrainingMatrix publicMode />
      </div>
    </div>
  </div>
);

export default PublicTrainingMatrix;
