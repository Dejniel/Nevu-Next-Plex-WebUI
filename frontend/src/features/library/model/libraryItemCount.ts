type LibraryCountSource = {
  size?: number;
  totalSize?: number;
};

export function formatLibraryItemCount(source: LibraryCountSource | null) {
  if (!source) return null;

  const count = source.totalSize ?? source.size;
  if (!Number.isFinite(count)) return null;
  return count!.toLocaleString();
}
