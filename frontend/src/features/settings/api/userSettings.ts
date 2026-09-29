import axios from "axios";
import { AuthStorage } from "features/session/model";
import { getBackendURL } from "shared/api/backend";

function profileHeaders() {
  const token = AuthStorage.getProfileAccountToken();
  if (!token) throw new Error("The active Plex profile is unavailable.");
  return { "X-Plex-Token": token };
}

export async function loadUserSettings(): Promise<Record<string, string>> {
  const response = await axios.get(`${getBackendURL()}/user/options`, {
    headers: profileHeaders(),
  });
  if (!Array.isArray(response.data)) return {};

  return Object.fromEntries(
    response.data.flatMap((option: unknown) => {
      if (
        !option ||
        typeof option !== "object" ||
        !("key" in option) ||
        !("value" in option) ||
        typeof option.key !== "string" ||
        typeof option.value !== "string"
      ) {
        return [];
      }
      return [[option.key, option.value]];
    }),
  );
}

export async function saveUserSetting(key: string, value: string) {
  await axios.post(
    `${getBackendURL()}/user/options`,
    { key, value },
    { headers: profileHeaders() },
  );
}
