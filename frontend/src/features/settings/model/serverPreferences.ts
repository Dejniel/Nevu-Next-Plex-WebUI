import type { PlexPreference } from "@nevu/contracts";

const GROUP_LABELS: Record<string, string> = {
  general: "General",
  library: "Library",
  network: "Network",
  transcoder: "Transcoder",
  butler: "Scheduled tasks",
  dlna: "DLNA",
  extras: "Extras",
  agents: "Agents",
  remoteaccess: "Remote access",
  languages: "Languages",
  debug: "Debug",
};

export function preferenceGroup(preference: PlexPreference) {
  return preference.group || "general";
}

export function preferenceGroupLabel(group: string) {
  return (
    GROUP_LABELS[group] ||
    group
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]/g, " ")
      .replace(/^./, (value) => value.toUpperCase())
  );
}

// The Setting descriptor does not specify side effects or restart requirements.
// Keep only known server-specific annotations here; field availability still comes from PMS.
// https://support.plex.tv/articles/201105343-advanced-hidden-server-settings/
export const SERVER_PREFERENCE_HINTS: Record<
  string,
  { description: string; requiresRestart?: boolean; password?: boolean }
> = {
  LogMemoryUse: {
    description: "Requires a Plex Media Server restart to take effect.",
    requiresRestart: true,
  },
  allowedNetworks: {
    description: "These networks can access Plex without signing in.",
  },
  secureConnections: {
    description:
      "Changing connection security can affect access from Plex clients.",
  },
  allowMediaDeletion: {
    description: "Allows permanent deletion of media files from disk.",
  },
  autoEmptyTrash: {
    description:
      "Unavailable library items are removed automatically after scanning.",
  },
  customCertificatePassword: { description: "", password: true },
};
