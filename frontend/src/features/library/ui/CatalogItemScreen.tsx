import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useActiveServerScope } from "features/session/model";
import { useLibraries } from "entities/library/model";
import {
  mediaMetadataQueryOptions,
  getTranscodeImageURL,
  mediaArtworkPath,
} from "entities/media/model";
import { serverQueryClient } from "shared/api/queryClient";
import { durationToText } from "shared/lib/duration";
import { catalogItemTo } from "shared/lib/navigation";
import { MusicActions, TrackList } from "features/music/public";
import { PhotoAlbumBrowse } from "./PhotoAlbumBrowse";
import { WindowLibraryCollectionGrid } from "./LibraryCollectionGrid";
import { useLibraryCardView } from "./LibraryCardViewControls";
import type { LibraryQuery } from "../model/libraryQuery";

export default function CatalogItemScreen() {
  const { libraryID = "", itemID = "" } = useParams();
  const scope = useActiveServerScope();
  const metadata = useQuery(
    mediaMetadataQueryOptions(scope, itemID),
    serverQueryClient,
  );
  const libraries = useLibraries();
  const library = libraries.data?.find((entry) => entry.key === libraryID);
  const location = useLocation();
  const navigate = useNavigate();
  const [description, setDescription] = useState(false);
  const cardView = useLibraryCardView();
  const item = metadata.data;
  const query: LibraryQuery | null =
    item && (item.type === "artist" || item.type === "album")
      ? {
          profileKey: scope.profileKey,
          sectionId: Number(libraryID),
          source: "children",
          parentId: itemID,
          type: item.type === "artist" ? "album" : "track",
          sort:
            item.type === "album" ? "parentIndex,index" : "year:desc,titleSort",
        }
      : null;
  const count =
    item?.type === "artist"
      ? item.childCount
      : (item?.leafCount ?? item?.childCount);
  const artwork = item && mediaArtworkPath(item, "square");
  const root = `/browse/${libraryID}?view=browse`;
  const parent =
    item?.parentRatingKey &&
    catalogItemTo(location, {
      ratingKey: item.parentRatingKey,
      type: item.type === "album" ? "artist" : "photoalbum",
      librarySectionID: Number(libraryID),
    });
  return (
    <Box sx={{ mt: "80px", px: { xs: 1.5, md: 6 }, pb: 3, width: "100%" }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", mb: 3 }}>
        <Button
          onClick={() =>
            location.state?.catalogNavigation ? navigate(-1) : navigate(root)
          }
        >
          Back
        </Button>
        <Breadcrumbs sx={{ minWidth: 0 }}>
          <MuiLink component={Link} to={root} color="inherit">
            {library?.title || "Library"}
          </MuiLink>
          {parent && (
            <MuiLink component={Link} to={parent} color="inherit">
              {item?.parentTitle || "Parent"}
            </MuiLink>
          )}
          <Typography>{item?.title || "Loading…"}</Typography>
        </Breadcrumbs>
      </Stack>
      {metadata.isPending ? (
        <CircularProgress />
      ) : metadata.error ? (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void metadata.refetch()}>Retry</Button>
          }
        >
          {metadata.error.message}
        </Alert>
      ) : item && ["artist", "album", "photoalbum"].includes(item.type) ? (
        <>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={3}
            sx={{ alignItems: { xs: "flex-start", sm: "center" }, mb: 3 }}
          >
            {artwork && (
              <Box
                component="img"
                alt=""
                src={getTranscodeImageURL(artwork, 480, 480)}
                sx={{
                  width: { xs: 140, sm: 200 },
                  height: { xs: 140, sm: 200 },
                  borderRadius: 2,
                  objectFit: "cover",
                  boxShadow: 5,
                }}
              />
            )}
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="overline" color="text.secondary">
                {item.type === "photoalbum" ? "Photo album" : item.type}
              </Typography>
              <Typography
                variant="h3"
                sx={{
                  fontSize: { xs: "1.8rem", sm: "2.5rem" },
                  overflowWrap: "anywhere",
                }}
              >
                {item.title}
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2 }}>
                {[
                  item.parentTitle,
                  item.year,
                  item.type === "album" && item.duration
                    ? durationToText(item.duration)
                    : null,
                  count
                    ? `${count} ${item.type === "artist" ? "albums" : item.type === "album" ? "tracks" : "items"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Typography>
              {item.type !== "photoalbum" && <MusicActions item={item} />}
              {item.summary && (
                <Box sx={{ mt: 2, maxWidth: 800 }}>
                  <Typography
                    color="text.secondary"
                    sx={
                      !description
                        ? {
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }
                        : undefined
                    }
                  >
                    {item.summary}
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => setDescription((value) => !value)}
                  >
                    {description ? "Show less" : "Read more"}
                  </Button>
                </Box>
              )}
            </Box>
          </Stack>
          {item.type === "album" ? (
            <TrackList query={query} album />
          ) : item.type === "photoalbum" ? (
            <PhotoAlbumBrowse
              key={itemID}
              libraryID={libraryID}
              parentId={itemID}
              cardView={cardView}
            />
          ) : (
            <WindowLibraryCollectionGrid
              query={query}
              layout="square"
              cardSize={cardView.size}
              emptyMessage="This artist has no albums."
            />
          )}
        </>
      ) : (
        <Alert severity="info">
          This item is not a browsable album or artist.
        </Alert>
      )}
    </Box>
  );
}
