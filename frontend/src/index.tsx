import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import AppProviders from "./app/AppProviders";
import { initializeRuntime } from "./app/bootstrap";
import "./index.css";

import "@fontsource-variable/quicksand";
import "@fontsource-variable/rubik";
import "@fontsource/ibm-plex-sans";
import "@fontsource-variable/inter";

initializeRuntime();

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <AppProviders>
    <App />
  </AppProviders>
);
