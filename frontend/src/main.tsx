import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 60_000,  // 30 min — data rarely changes mid-session
      gcTime: 60 * 60_000,     // 60 min — keep cache alive across tab switches
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,   // don't refetch stale data on every mount
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
