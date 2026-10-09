import { Alert, Button } from "@mui/material";

/** Query failures are warnings when the view still has usable cached data. */
export function QueryErrorAlert({
  error,
  hasData,
  onRetry,
}: {
  error: { message: string } | null | undefined;
  hasData: boolean;
  onRetry?: () => unknown;
}) {
  return (
    error && (
      <Alert
        severity={hasData ? "warning" : "error"}
        sx={{ mb: 2 }}
        action={
          onRetry && <Button onClick={() => void onRetry()}>Retry</Button>
        }
      >
        {error.message}
      </Alert>
    )
  );
}
