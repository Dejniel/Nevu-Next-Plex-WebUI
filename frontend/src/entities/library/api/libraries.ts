import { plexClient } from "features/session/model";
import { readLibrarySections } from "./libraryCatalog";

export async function getLibraries(signal?: AbortSignal) {
  return readLibrarySections(
    await plexClient.get<unknown>("/library/sections", signal),
  );
}
