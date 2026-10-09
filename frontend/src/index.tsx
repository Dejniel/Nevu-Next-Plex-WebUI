import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { serverQueryClient } from "shared/api/queryClient";
import App from "./app/App";
import AppProviders from "./app/AppProviders";
import { initializeRuntime } from "./app/bootstrap";
import "./index.css";

import "@fontsource-variable/inter";

initializeRuntime();

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

root.render(
  <QueryClientProvider client={serverQueryClient}>
    <AppProviders>
      <App />
    </AppProviders>
  </QueryClientProvider>,
);
