import axios from "axios";

export type AuthErrorContext =
  | "loginStart"
  | "loginCallback"
  | "account"
  | "profiles"
  | "profile"
  | "server";

function plexErrorCode(error: unknown): number | undefined {
  if (!axios.isAxiosError(error)) return undefined;

  const errors = error.response?.data?.errors;
  return Array.isArray(errors) && typeof errors[0]?.code === "number"
    ? errors[0].code
    : undefined;
}

export function authErrorMessage(
  error: unknown,
  context: AuthErrorContext,
): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;

    if (!error.response)
      return "Cannot reach Plex. Check the network connection and try again.";

    if (
      context === "loginCallback" &&
      (status === 404 || plexErrorCode(error) === 1020)
    )
      return "This Plex sign-in request expired or was already used. Start again.";

    if (status === 429)
      return "Plex is temporarily rate limiting sign-in attempts. Wait a moment and try again.";

    if (status !== undefined && status >= 500)
      return "Plex is temporarily unavailable. Try again in a moment.";

    if (status === 401 || status === 403) {
      if (context === "profile") return "Incorrect profile PIN.";
      if (context === "server")
        return "This Plex profile does not have access to the configured server.";
      return "The saved Plex session has expired. Sign in again.";
    }
  }

  if (error instanceof Error) {
    const safeMessages = [
      "The selected profile cannot access this Plex server.",
      "The selected profile does not have access to this server.",
      "Plex did not return a profile token.",
      "Nevu cannot reach the configured Plex server.",
    ];
    if (safeMessages.includes(error.message)) return error.message;
  }

  switch (context) {
    case "loginStart":
      return "Unable to start Plex sign-in. Try again.";
    case "loginCallback":
      return "Plex did not complete sign-in. Start again.";
    case "account":
      return "Unable to verify the Plex account. Try again.";
    case "profiles":
      return "Unable to load Plex Home profiles. Try again.";
    case "profile":
      return "Unable to switch Plex Home profile. Try again.";
    case "server":
      return "Unable to connect this profile to the configured Plex server.";
  }
}
