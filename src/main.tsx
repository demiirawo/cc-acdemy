import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import './index.css'
import Index from './pages/Index.tsx'
import NotFound from './pages/NotFound.tsx'
import { PublicPageView } from './components/PublicPageView.tsx'
import ProjectView from './components/ProjectView.tsx'
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from "./hooks/useAuth";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Index />,
  },
  {
    path: "/public/:token",
    element: <PublicPageView />,
  },
  {
    path: "/project/:projectId",
    element: <ProjectView />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
      <Toaster />
    </AuthProvider>
  </StrictMode>,
)
