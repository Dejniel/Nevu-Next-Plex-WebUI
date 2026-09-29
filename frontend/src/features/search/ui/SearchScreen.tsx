import { Alert, Box, CircularProgress, Grid, Typography } from "@mui/material";
import React, { useMemo } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { WatchlistMediaCard } from "features/watchlist/public";
import { libraryBrowseTo } from "shared/lib/navigation";
import { partitionSearchResults } from "../model/searchResults";
import { usePlexSearch } from "../model/usePlexSearch";

export default function SearchScreen() {
  const { query } = useParams();
  const location = useLocation();
  const search = usePlexSearch(query ?? "");
  const { media, directories } = useMemo(
    () => partitionSearchResults(search.results),
    [search.results],
  );

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        height: "100%",
        width: "100%",
        mt: "64px",
        px: 6,
        py: 2,

        pt: 4,
        pb: 6,
      }}
    >
      <Typography variant="h3" sx={{ mt: 2 }}>
        {query ? (
          <>
            Results for <strong>{query}</strong>
          </>
        ) : (
          "Use Search Bar to Search"
        )}
      </Typography>

      {search.loading && <CircularProgress sx={{ mt: 4 }} />}
      {search.error && <Alert severity="error" sx={{ mt: 3 }}>{search.error}</Alert>}

      <Grid container spacing={2} sx={{ mt: 2, width: "100%" }}>
        {directories.length > 0 && (
          <>
            <Grid key={"dir"} size={{ xs: 12 }}>
              <Typography variant="h4">Categories</Typography>
            </Grid>

            {directories.map((item) => (
              <Grid key={item.key} size={{ xl: 2, lg: 3, md: 6, sm: 12, xs: 12 }}>
                <DirectoryItem
                  item={item}
                  to={libraryBrowseTo(
                    location,
                    `/library/sections/${item.librarySectionID}/genre/${item.id}`
                  )}
                />
              </Grid>
            ))}

            <Grid key={"dir"} size={{ xs: 12 }}></Grid>
          </>
        )}

        {!search.loading &&
          media.map((item) => (
            <Grid
              key={item.ratingKey}
              size={{ xs: 12, sm: 6, md: 4, lg: 3, xl: 2 }}
            >
              <WatchlistMediaCard item={item} />
            </Grid>
          ))}
      </Grid>
    </Box>
  );
}

export function DirectoryItem({
  item,
  to,
}: {
  item: Plex.Directory;
  to: React.ComponentProps<typeof Link>["to"];
}) {
  return (
    <Box
      component={Link}
      to={to}
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        bgcolor: "rgba(0,0,0,0.1)",
        borderRadius: "8px",
        p: 2,
        background: "#333333",
        cursor: "pointer",
        color: "inherit",
        textDecoration: "none",

        "&:hover": {
          background: "#444444",
        },
        userSelect: "none",
      }}
    >
      <Typography variant="h5">
        {item.librarySectionTitle} - {item.tag}
      </Typography>
    </Box>
  );
}
