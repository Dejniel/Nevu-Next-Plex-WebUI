import type { LibraryPageDto, LibraryPageRequest } from "@nevu/contracts";
import axios from "axios";
import { AuthStorage } from "../auth/AuthStorage";
import { getBackendURL } from "../backendURL";

export async function getLibraryPage(
  request: LibraryPageRequest,
): Promise<LibraryPageDto> {
  const token = AuthStorage.getServerToken();
  if (!token) throw new Error("The active Plex session is missing");

  const response = await axios.get<LibraryPageDto>(
    `${getBackendURL()}/library-page`,
    {
      params: request,
      headers: { "X-Plex-Token": token },
    },
  );
  return response.data;
}
