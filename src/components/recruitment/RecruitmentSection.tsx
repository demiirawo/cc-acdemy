import { useState } from "react";
import { TestsList } from "./TestsList";
import { TestBuilder } from "./TestBuilder";
import { ResultsDashboard } from "./ResultsDashboard";
import { ResultDetail } from "./ResultDetail";

type View =
  | { name: "list" }
  | { name: "builder"; testId: string | null }
  | { name: "results"; testId: string }
  | { name: "detail"; attemptId: string; testId: string };

export function RecruitmentSection() {
  const [view, setView] = useState<View>({ name: "list" });

  return (
    <div className="flex-1 overflow-auto p-6 bg-background">
      {view.name === "list" && (
        <TestsList
          onCreate={() => setView({ name: "builder", testId: null })}
          onEdit={(id) => setView({ name: "builder", testId: id })}
          onResults={(id) => setView({ name: "results", testId: id })}
        />
      )}
      {view.name === "builder" && (
        <TestBuilder
          testId={view.testId}
          onBack={() => setView({ name: "list" })}
        />
      )}
      {view.name === "results" && (
        <ResultsDashboard
          testId={view.testId}
          onBack={() => setView({ name: "list" })}
          onOpen={(attemptId) =>
            setView({ name: "detail", attemptId, testId: view.testId })
          }
        />
      )}
      {view.name === "detail" && (
        <ResultDetail
          attemptId={view.attemptId}
          onBack={() => setView({ name: "results", testId: view.testId })}
        />
      )}
    </div>
  );
}
