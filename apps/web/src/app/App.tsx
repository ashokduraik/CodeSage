import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/shared/layout/AppLayout";
import { ProtectedRoute } from "@/shared/layout/ProtectedRoute";
import { AdminRoute } from "@/shared/layout/AdminRoute";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { Chat } from "@/features/chat/Chat";
import { LoginPage } from "@/features/auth";
import { ProjectsPage } from "@/features/projects";
import { AuditLogPage } from "@/features/audit";

/**
 * Root application component. Sets up client-side routing, authentication
 * guards, and renders each page inside the shared {@link AppLayout} chrome.
 *
 * Public routes (no auth required):
 * - `/login` — login form
 *
 * Protected routes (JWT required, redirect to /login otherwise):
 * - `/` — Dashboard
 * - `/chat`, `/chat/:sessionId` — QA Chat
 * - `/projects` — Projects management
 *
 * Admin routes (JWT + admin role):
 * - `/admin/audit-log` — Security audit log viewer
 */
export function App(): JSX.Element {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/chat/:sessionId" element={<Chat />} />
            <Route path="/projects" element={<ProjectsPage />} />
          </Route>
          <Route element={<AdminRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/admin/audit-log" element={<AuditLogPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
