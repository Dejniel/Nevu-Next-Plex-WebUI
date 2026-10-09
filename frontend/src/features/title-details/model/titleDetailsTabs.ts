export const titleDetailsTabs = [
  { id: "overview", label: "Overview" },
  { id: "episodes", label: "Episodes" },
  { id: "details", label: "Details & Extras" },
  { id: "reviews", label: "Reviews" },
  { id: "media", label: "Media" },
] as const;
export type TitleDetailsTab = (typeof titleDetailsTabs)[number]["id"];

export function resolveTitleDetailsTab(
  value: string | null,
  type?: string,
): TitleDetailsTab {
  return (
    titleDetailsTabs.find(
      (tab) => tab.id === value && (tab.id !== "episodes" || type === "show"),
    )?.id ?? "overview"
  );
}
