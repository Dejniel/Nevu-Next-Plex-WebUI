import { ThemeProvider } from "@emotion/react";
import { CssBaseline } from "@mui/material";
import { PropsWithChildren } from "react";
import { BrowserRouter } from "react-router-dom";
import { appTheme } from "./theme";

export default function AppProviders({ children }: PropsWithChildren) {
  return (
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <BrowserRouter>{children}</BrowserRouter>
    </ThemeProvider>
  );
}
