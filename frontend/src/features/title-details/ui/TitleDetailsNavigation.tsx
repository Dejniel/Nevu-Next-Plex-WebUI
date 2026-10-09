import { Box, MenuItem, Select, Tab, Tabs } from "@mui/material";
import {
  titleDetailsTabs,
  type TitleDetailsTab,
} from "../model/titleDetailsTabs";
import type { TitleEpisodesModel } from "../model/useTitleEpisodes";

export default function TitleDetailsNavigation({
  tab,
  type,
  onChange,
  episodes,
}: {
  tab: TitleDetailsTab;
  type?: string;
  onChange: (tab: TitleDetailsTab) => void;
  episodes: TitleEpisodesModel;
}) {
  return (
    <Box
      sx={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 2,
        mb: 1,
        flexWrap: { xs: "wrap", sm: "nowrap" },
      }}
    >
      <Tabs
        value={tab}
        onChange={(_, value: TitleDetailsTab) => onChange(value)}
        variant="scrollable"
        scrollButtons="auto"
        aria-label="Title details"
        sx={{
          flex: { xs: "1 0 100%", sm: 1 },
          minWidth: 0,
          "& .MuiTabs-list": { gap: { xs: 2, sm: 3, md: 5 } },
          "& .MuiTab-root": {
            p: 0,
            m: 0,
            minWidth: 0,
            borderRadius: 0,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: { xs: "0.85rem", sm: "1.25rem" },
            color: "text.disabled",
            "&.Mui-selected": { bgcolor: "transparent", color: "primary.main" },
            "&:hover": { bgcolor: "transparent", color: "text.primary" },
          },
        }}
      >
        {titleDetailsTabs
          .filter((entry) => entry.id !== "episodes" || type === "show")
          .map((entry) => (
            <Tab
              key={entry.id}
              id={`title-tab-${entry.id}`}
              aria-controls={`title-panel-${entry.id}`}
              value={entry.id}
              label={entry.label}
            />
          ))}
      </Tabs>
      {tab === "episodes" && episodes.seasons.length > 1 && (
        <Select
          size="small"
          value={episodes.seasonId}
          onChange={(event) => episodes.selectSeason(event.target.value)}
          inputProps={{ "aria-label": "Season" }}
          sx={{ ml: "auto" }}
        >
          {episodes.seasons.map((season) => (
            <MenuItem key={season.ratingKey} value={season.ratingKey}>
              {season.title}
            </MenuItem>
          ))}
        </Select>
      )}
    </Box>
  );
}
