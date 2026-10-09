import type { MediaMetadata } from "entities/media/model";
function searchableResults(results: Plex.SearchResult[]) {
  return results.filter(
    (result) =>
      Boolean(
        result.Directory ||
          (result.Metadata && ["movie", "show"].includes(result.Metadata.type)),
      ),
  );
}

export function searchSuggestions(
  results: Plex.SearchResult[],
  limit = 8,
) {
  return searchableResults(results)
    .map((result, index) => ({ result, index }))
    .sort((left, right) => {
      const directoryOrder = Number(Boolean(right.result.Directory)) -
        Number(Boolean(left.result.Directory));
      return directoryOrder || left.index - right.index;
    })
    .slice(0, limit)
    .map(({ result }) => result);
}

export function partitionSearchResults(results: Plex.SearchResult[]) {
  const media: MediaMetadata[] = [];
  const directories: Plex.Directory[] = [];

  searchableResults(results).forEach((result) => {
    if (result.Metadata) media.push(result.Metadata);
    else if (result.Directory) directories.push(result.Directory);
  });

  return { media, directories };
}
