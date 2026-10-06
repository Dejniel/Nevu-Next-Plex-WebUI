import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { libraryDirectoryQueryOptions } from "./libraryDirectories";
import { libraryFilterValues } from "./libraryFilterValues";

export default function useLibraryFilterValues(source: Plex.Filter | undefined, enabled = true) {
  const scope = useActiveServerScope();
  const options = libraryDirectoryQueryOptions(scope, source?.key ?? "");
  const query = useQuery({
    ...options,
    enabled: Boolean(enabled && source && options.enabled),
    select: (data) => libraryFilterValues(data.Directory, source?.filter ?? ""),
  }, serverQueryClient);
  return {
    options: enabled && source ? query.data ?? [] : [],
    loading: Boolean(enabled && source && options.enabled) && query.isPending,
    error: Boolean(enabled && source) && query.isError,
    retry: () => query.refetch(),
  };
}
