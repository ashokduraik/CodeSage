import "./index.css"; // Tailwind layers + design-token CSS variables
import "./i18n"; // side-effect: initialises the i18next instance before render
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./features/auth";
import { App } from "./app/App";
import { ApiClientError } from "./shared/lib/apiClient";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiClientError && error.status === 401) {
          return false;
        }
        return failureCount < 3;
      },
    },
  },
});

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
