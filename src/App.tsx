
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import ProjectView from "./components/ProjectView";

import { PublicPageView } from "./components/PublicPageView";
import { PublicClientSchedule } from "./components/PublicClientSchedule";
import AcknowledgeShiftChangePage from "./components/AcknowledgeShiftChangePage";
import AcknowledgeFeedbackPage from "./components/AcknowledgeFeedbackPage";
import { PublicLiveView } from "./components/PublicLiveView";
import { PublicTrainingMatrix } from "./components/PublicTrainingMatrix";
import { CandidateApplyPage } from "./components/recruitment/CandidateApplyPage";
import { PublicStaffMeeting } from "./components/PublicStaffMeeting";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ContractPage } from "./components/hr/contracts/ContractPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* A component that throws must not take the whole app down with it —
            that is what turns a small bug into "I got thrown out". */}
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/page/:pageId" element={<Index />} />
          <Route path="/view/:viewName" element={<Index />} />
          <Route path="/payroll" element={<Navigate to="/view/hr?tab=payroll" replace />} />
          
          <Route path="/contract/:contractId" element={<ContractPage />} />
          <Route path="/acknowledge-shift-change" element={<AcknowledgeShiftChangePage />} />
          <Route path="/acknowledge-feedback" element={<AcknowledgeFeedbackPage />} />
          <Route path="/public/schedule/:clientName" element={<PublicClientSchedule />} />
          <Route path="/public/schedule-only/:clientName" element={<PublicClientSchedule scheduleOnly />} />
          <Route path="/embed/live-view" element={<PublicLiveView />} />
          <Route path="/public/training-matrix" element={<PublicTrainingMatrix />} />
          <Route path="/public/staff-meeting" element={<PublicStaffMeeting />} />
          <Route path="/apply/:slug" element={<CandidateApplyPage />} />
          <Route path="/public/:token" element={<PublicPageView />} />
          <Route path="/project/:projectId" element={<ProjectView />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
