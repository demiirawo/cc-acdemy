
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
import { PublicLiveView } from "./components/PublicLiveView";
import { PublicTrainingMatrix } from "./components/PublicTrainingMatrix";
import { CandidateApplyPage } from "./components/recruitment/CandidateApplyPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/page/:pageId" element={<Index />} />
          <Route path="/view/:viewName" element={<Index />} />
          <Route path="/payroll" element={<Navigate to="/view/hr?tab=payroll" replace />} />
          
          <Route path="/public/schedule/:clientName" element={<PublicClientSchedule />} />
          <Route path="/public/schedule-only/:clientName" element={<PublicClientSchedule scheduleOnly />} />
          <Route path="/embed/live-view" element={<PublicLiveView />} />
          <Route path="/public/training-matrix" element={<PublicTrainingMatrix />} />
          <Route path="/apply/:slug" element={<CandidateApplyPage />} />
          <Route path="/public/:token" element={<PublicPageView />} />
          <Route path="/project/:projectId" element={<ProjectView />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
