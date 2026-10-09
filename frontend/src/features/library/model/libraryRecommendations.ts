import type { MediaMetadata } from "entities/media/model";
type RecommendationTagField = "Genre" | "Role";

export interface PreferredTag {
  title: string;
  score: number;
}

export function pickPreferredTag(
  history: MediaMetadata[],
  field: RecommendationTagField,
): PreferredTag | null {
  const scores = new Map<string, PreferredTag>();
  const perItemLimit = field === "Role" ? 5 : 3;

  history.forEach((item, itemIndex) => {
    const recencyWeight = 1 / (1 + itemIndex / 8);
    const tags = item[field] || [];

    tags.slice(0, perItemLimit).forEach((tag, tagIndex) => {
      const title = tag.tag?.trim();
      if (!title) return;

      const key = title.toLocaleLowerCase();
      const positionWeight = 1 / (1 + tagIndex * 0.15);
      const score = recencyWeight * positionWeight;
      const current = scores.get(key);

      scores.set(key, {
        title: current?.title || title,
        score: (current?.score || 0) + score,
      });
    });
  });

  return (
    [...scores.values()].sort(
      (a, b) => b.score - a.score || a.title.localeCompare(b.title),
    )[0] || null
  );
}

export function matchRecommendationDirectory(
  preferred: PreferredTag | null,
  directories: Plex.Directory[] | undefined,
) {
  if (!preferred) return null;
  const normalizedTitle = preferred.title.toLocaleLowerCase();

  return (
    directories?.find(
      (directory) => directory.title?.toLocaleLowerCase() === normalizedTitle,
    ) || null
  );
}
