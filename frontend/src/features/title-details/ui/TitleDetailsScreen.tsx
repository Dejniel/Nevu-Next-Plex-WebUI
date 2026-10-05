import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Typography,
  Tooltip,
} from "@mui/material";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import React, { JSX, useEffect, useState } from "react";
import {
  applyMediaWatchedState,
  getMediaMetadata,
  getResponsiveTranscodeImageProps,
  getTranscodeImageURL,
  DETAIL_POSTER_IMAGE_WIDTHS,
  HERO_IMAGE_WIDTHS,
  isMediaWatched,
  setMediaPlayedStatus,
} from "entities/media/model";
import {
  CheckCircleRounded,
  PlayArrowRounded,
  CheckCircleOutlineRounded,
  CheckBoxOutlineBlankRounded,
  CheckBoxRounded,
  MoreVertRounded,
} from "@mui/icons-material";
import { durationInMinutes, durationToText } from "shared/lib/duration";
import { alpha } from "@mui/material/styles";
import { AnimatePresence, motion } from "motion/react";
import { AppDialog, StretchedLink, useConfirmModal } from "shared/ui";
import TitleReviews from "./TitleReviews";
import TitleOverview from "./TitleOverview";
import TitleDetails from "./TitleDetails";
import TitleMedia from "./TitleMedia";
import {
  applyMetadataUpdate,
  EditMetadataDialog,
  MatchMetadataDialog,
  getMediaActionCapabilities,
  type MetadataLockUpdate,
  type MetadataUpdate,
} from "features/media-actions/public";
import { withoutExtra } from "entities/media/model";
import { useCanManageServer, useServerSession } from "features/session/public";
import { useTitleExtras } from "../model/useTitleExtras";
import ExpandableDescription from "./ExpandableDescription";
import { libraryBrowseTo, mediaWatchTo } from "shared/lib/navigation";
import { useTitleDetailsData } from "../model/useTitleDetailsData";
import TitlePrimaryActions from "./TitlePrimaryActions";
import {
  openMediaListDialog,
  renderMediaListMenuItems,
} from "features/media-lists/public";

const DESKTOP_HERO_HEIGHT = "clamp(560px, 93.333vh, 960px)";
const detailsPages: Record<string, number> = {
  overview: 0,
  episodes: 1,
  details: 2,
  reviews: 3,
  media: 4,
};

function TitleScore({
  label,
  value,
  image,
}: {
  label: string;
  value?: number;
  image?: string;
}) {
  if (value === undefined) return null;
  const score = image?.toLowerCase().includes("rottentomatoes")
    ? `${Math.round(value * 10)}%`
    : `${value.toFixed(1)}/10`;

  return (
    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.5 }}>
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700 }}>{score}</Typography>
    </Box>
  );
}

function TitleDetailsScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const canManageServer = useCanManageServer();
  const allowDownloads = useServerSession(
    (state) => state.server?.allowSync === true,
  );
  const posterRef = React.useRef<HTMLDivElement>(null);

  const [page, setPage] = useState<number>(0);
  const [editMetadataOpen, setEditMetadataOpen] = useState(false);
  const [matchOpen, setMatchOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mid = searchParams.get("mid");
  const plexGuid = searchParams.get("pguid");
  const requestedPage = detailsPages[searchParams.get("detailsTab") || ""] ?? 0;
  const {
    data,
    episodes,
    languages,
    loadError,
    loading,
    refetchEpisodes,
    resolvedRatingKey,
    selectedSeason,
    setData,
    setSelectedSeason,
    subtitles,
  } = useTitleDetailsData(mid, plexGuid);
  const capabilities = data
    ? getMediaActionCapabilities(data, {
        localItem: true,
        canManageServer,
        allowDownloads,
      })
    : null;
  const {
    extras,
    loading: extrasLoading,
    primaryTrailer,
  } = useTitleExtras(data);

  const closeDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("mid");
    next.delete("pguid");
    next.delete("detailsTab");
    setSearchParams(next);
  };

  useEffect(() => {
    if (!resolvedRatingKey) return;
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("pguid");
        next.set("mid", resolvedRatingKey);
        return next;
      },
      { replace: true },
    );
  }, [resolvedRatingKey, setSearchParams]);

  useEffect(() => {
    setPage(requestedPage);
  }, [mid, plexGuid, requestedPage]);

  useEffect(() => {
    setEditMetadataOpen(false);
    setMatchOpen(false);
    setNotice(null);
  }, [mid, plexGuid]);

  const remainingExtras = withoutExtra(extras, primaryTrailer);
  const directors = (data?.Director || [])
    .map(({ tag }) => tag)
    .filter(Boolean)
    .join(", ");
  const heroArtwork = data?.art
    ? getResponsiveTranscodeImageProps(data.art, {
        widths: HERO_IMAGE_WIDTHS,
        aspectRatio: 16 / 9,
        sizes: "(max-width: 600px) 100vw, 90vw",
        fallbackWidth: 1280,
      })
    : null;
  const posterPath = data?.thumb || data?.art;
  const posterArtwork = posterPath
    ? getResponsiveTranscodeImageProps(posterPath, {
        widths: DETAIL_POSTER_IMAGE_WIDTHS,
        aspectRatio: 2 / 3,
        sizes: "(max-width: 600px) 320px, 27vw",
        fallbackWidth: 480,
      })
    : null;

  const metadataWasSaved = (
    changes: MetadataUpdate,
    lockChanges: MetadataLockUpdate,
  ) => {
    setData((current) =>
      current ? applyMetadataUpdate(current, changes, lockChanges) : current,
    );
    setNotice("Metadata saved");

    if (mid)
      void getMediaMetadata(mid)
        .then((metadata) => setData(metadata))
        .catch(() => undefined);
  };

  if (!mid && !plexGuid) return <></>;

  if (loading)
    return (
      <AppDialog open onClose={closeDetails} contentSx={{ p: 0 }}>
        <Box
          sx={{
            minHeight: "50vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <CircularProgress />
        </Box>
      </AppDialog>
    );

  if (loadError)
    return (
      <AppDialog
        open
        size="compact"
        onClose={closeDetails}
        title="Title unavailable"
      >
        <Alert severity="error">{loadError}</Alert>
      </AppDialog>
    );

  // const selectedSeasonData = data?.Children?.Metadata.find(
  //   (season) => season.index === selectedSeason
  // );

  return (
    <AppDialog
      open={Boolean(mid)}
      onClose={closeDetails}
      contentSx={{ p: 0, backgroundColor: "background.default" }}
    >
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          backgroundColor: "background.default",
          pb: { xs: 6, sm: 4 },
          position: "relative",
        }}
      >
        <Box
          sx={{
            width: "100%",
            maxWidth: "100%",
            height: { xs: "50vh", sm: DESKTOP_HERO_HEIGHT },
            backgroundColor: "#000000AA",

            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            padding: { xs: 0, sm: "1%" },
            borderTopLeftRadius: { xs: 0, sm: "10px" },
            borderTopRightRadius: { xs: 0, sm: "10px" },
            position: "relative",
            zIndex: 0,
            overflow: "hidden",
            userSelect: "none",
          }}
        >
          {heroArtwork && (
            <Box
              component="img"
              {...heroArtwork}
              alt=""
              loading="eager"
              decoding="async"
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
                filter: "brightness(0.32)",
              }}
            />
          )}
        </Box>

        <Box
          sx={{
            mt: { xs: "-25vh", sm: "-15vh" },
            height: { xs: "25vh", sm: "30vh" },
            width: "100%",
            background: (theme) =>
              `linear-gradient(180deg, ${alpha(
                theme.palette.background.default,
                0,
              )}, ${theme.palette.background.default}, ${
                theme.palette.background.default
              })`,
            zIndex: 1,
            pointerEvents: "none",
            position: "relative",
          }}
        />

        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: { xs: "center", sm: "flex-start" },
            justifyContent: "center",
            width: "100%",
            padding: "0 3%",
            mt: {
              xs: "-38vh",
              sm: `calc(3% - 15vh - ${DESKTOP_HERO_HEIGHT})`,
            },
            gap: "3%",
            zIndex: 2,
          }}
        >
          <Box
            ref={posterRef}
            sx={{
              width: { xs: "100%", sm: "30%" },
              maxWidth: { xs: "320px", sm: "none" },
              mb: { xs: 2, sm: 0 },
              borderRadius: "10px",
              overflow: "hidden",
              boxShadow: (theme) =>
                `0 20px 25px -5px ${theme.palette.common.black}`,
              position: "relative",
              aspectRatio: "2/3",
              backgroundColor: "#17191e",
            }}
          >
            {posterArtwork && (
              <img
                {...posterArtwork}
                alt={data?.title || ""}
                loading="eager"
                decoding="async"
                style={{
                  width: "100%",
                  aspectRatio: "2/3",
                  backgroundColor: "#00000088",
                  objectFit: "cover",
                  display: "block",
                }}
              />
            )}
          </Box>

          <Box
            sx={{
              width: { xs: "100%", sm: "70%" },
              display: "flex",
              flexDirection: "column",
              alignItems: { xs: "center", sm: "flex-start" },
              justifyContent: "flex-start",
              height: { xs: "100%", sm: "auto" },
              marginLeft: { xs: 0, sm: "1%" },
            }}
          >
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: { xs: "center", sm: "flex-start" },
                justifyContent: "flex-start",
                width: "100%",
                height: { xs: "65%", sm: "auto" },
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: { xs: "center", sm: "flex-start" },
                  mb: { xs: 0, sm: "-10px" },
                }}
              >
                <Typography
                  sx={{
                    fontSize: { xs: "18px", sm: "24px" },
                    fontWeight: "900",
                    letterSpacing: "0.1em",
                    color: (theme) => theme.palette.primary.main,
                    textTransform: "uppercase",
                  }}
                >
                  {data?.type}
                </Typography>
              </Box>

              <Typography
                sx={{
                  fontSize: { xs: "2rem", sm: "3rem" },
                  fontWeight: "bold",
                  mt: 0,
                  mb: { xs: 1, sm: 0 },
                  lineHeight: { xs: 1.2, sm: "normal" },
                  textAlign: { xs: "center", sm: "left" },
                  color: (theme) => theme.palette.text.primary,
                }}
              >
                {data?.title}
              </Typography>

              {directors && (
                <Typography
                  sx={{
                    mt: 0.25,
                    fontSize: { xs: "0.7rem", sm: "0.75rem" },
                    lineHeight: 1.3,
                    color: "text.secondary",
                    textAlign: { xs: "center", sm: "left" },
                  }}
                >
                  Directed by: {directors}
                </Typography>
              )}

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "row",
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: { xs: "center", sm: "flex-start" },
                  mt: 1,
                  mb: 1,
                  gap: 1,
                }}
              >
                {data && isMediaWatched(data) && (
                  <CheckCircleRounded
                    sx={{
                      color: (theme) => theme.palette.primary.light,
                      fontSize: "large",
                    }}
                  />
                )}
                {data?.contentRating && (
                  <Typography
                    sx={{
                      fontSize: "medium",
                      fontWeight: "light",
                      color: (theme) => theme.palette.text.secondary,
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderRadius: "5px",
                      px: 1,
                      py: 0.2,
                    }}
                  >
                    {data?.contentRating}
                  </Typography>
                )}
                {data?.year && (
                  <Typography
                    sx={{
                      fontSize: "medium",
                      fontWeight: "light",
                      color: (theme) => theme.palette.text.secondary,
                    }}
                  >
                    {data?.year}
                  </Typography>
                )}
                {data?.duration &&
                  ["episode", "movie"].includes(data?.type) && (
                    <Typography
                      sx={{
                        fontSize: "medium",
                        fontWeight: "light",
                        color: (theme) => theme.palette.text.secondary,
                      }}
                    >
                      {durationToText(data?.duration)}
                    </Typography>
                  )}
                {data?.type === "show" &&
                  data?.leafCount &&
                  data?.childCount && (
                    <Typography
                      sx={{
                        fontSize: "medium",
                        fontWeight: "light",
                        color: (theme) => theme.palette.text.secondary,
                      }}
                    >
                      {data?.childCount > 1
                        ? `${data?.childCount} Seasons`
                        : `${data?.leafCount} Episode${
                            data?.leafCount > 1 ? "s" : ""
                          }`}
                    </Typography>
                  )}
              </Box>

              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: { xs: "center", sm: "flex-start" },
                  gap: 2,
                }}
              >
                <TitleScore
                  label="Critics"
                  value={data?.rating}
                  image={data?.ratingImage}
                />
                <TitleScore
                  label="Audience"
                  value={data?.audienceRating}
                  image={data?.audienceRatingImage}
                />
                <TitleScore label="You" value={data?.userRating} />
              </Box>

              <Box
                sx={{
                  width: "100%",
                  mt: 2,
                }}
              >
                {data && capabilities && (
                  <TitlePrimaryActions
                    capabilities={capabilities}
                    data={data}
                    onDataChanged={setData}
                    onEditMetadata={() => setEditMetadataOpen(true)}
                    onMatch={() => setMatchOpen(true)}
                  />
                )}
              </Box>

              <Box
                sx={{
                  width: "100%",
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: { xs: "center", sm: "flex-start" },
                  flexWrap: "wrap",
                  gap: 0.5,
                  mt: 2,
                }}
              >
                <Typography sx={{ color: "text.secondary" }}>Genres: </Typography>
                {data?.Genre?.slice(0, 5).map((genre, index) => (
                  <Typography
                    component={Link}
                    to={libraryBrowseTo(
                      location,
                      `/library/sections/${data?.librarySectionID}/genre/${genre.id}`,
                    )}
                    key={genre.id}
                    sx={{
                      color: (theme) => theme.palette.text.primary,
                      fontWeight: "medium",
                      cursor: "pointer",
                      "&:hover": {
                        color: (theme) => theme.palette.primary.main,
                        textDecoration: "none",
                      },
                      transition: "all 0.2s ease",
                      textDecoration: "none",
                    }}
                  >
                    {genre.tag}
                    {index + 1 === data?.Genre?.slice(0, 5).length ? "" : ","}
                  </Typography>
                ))}
              </Box>

              <Collapse in={Boolean(languages || subtitles)}>
                <Box sx={{ mt: 1 }}>
                  <Box
                    sx={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: { xs: "center", sm: "flex-start" },
                      flexWrap: "wrap",
                      gap: 0.5,
                    }}
                  >
                    {languages && languages.length > 0 && (
                      <>
                        <Typography sx={{ color: "text.secondary" }}>Audio: </Typography>
                        {languages.slice(0, 10).map((lang, index) => (
                          <Typography
                            key={index}
                            sx={{
                              color: (theme) => theme.palette.text.primary,
                              fontWeight: "medium",
                            }}
                          >
                            {lang}
                            {index + 1 === languages.slice(0, 10).length
                              ? ""
                              : ","}
                          </Typography>
                        ))}
                      </>
                    )}
                  </Box>

                  <Box
                    sx={{
                      width: "100%",
                      display: "flex",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: { xs: "center", sm: "flex-start" },
                      flexWrap: "wrap",
                      gap: 0.5,
                    }}
                  >
                    {subtitles && subtitles.length > 0 && (
                      <>
                        <Typography sx={{ color: "text.secondary" }}>
                          Subtitles:{" "}
                        </Typography>
                        {subtitles.slice(0, 10).map((lang, index) => (
                          <Typography
                            key={index}
                            sx={{
                              color: (theme) => theme.palette.text.primary,
                              fontWeight: "medium",
                            }}
                          >
                            {lang}
                            {index + 1 === subtitles.slice(0, 10).length
                              ? ""
                              : ","}
                          </Typography>
                        ))}
                      </>
                    )}
                  </Box>
                </Box>
              </Collapse>

              <Box sx={{ mt: 1.5, width: "100%" }}>
                <ExpandableDescription
                  text={data?.summary}
                  lines={6}
                  boundaryRef={posterRef}
                />
              </Box>
            </Box>
          </Box>
        </Box>

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            width: "100%",
            px: "3%",
            mt: "3vh",
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: { xs: 2, sm: 3, md: 5 },
              mb: "10px",
              overflowX: "auto",
              flexShrink: 0,
              "&::-webkit-scrollbar": { display: "none" },
              scrollbarWidth: "none",
            }}
          >
            <TabButton
              onClick={() => {
                setPage(0);
              }}
              selected={page === 0}
              text="Overview"
            />

            {data?.type === "show" && (
              <TabButton
                onClick={() => {
                  setPage(1);
                }}
                selected={page === 1}
                text="Episodes"
              />
            )}

            <TabButton
              onClick={() => {
                setPage(2);
              }}
              selected={page === 2}
              text="Details & Extras"
            />

            <TabButton
              onClick={() => {
                setPage(3);
              }}
              selected={page === 3}
              text="Reviews"
            />

            <TabButton
              onClick={() => {
                setPage(4);
              }}
              selected={page === 4}
              text="Media"
            />

            {data?.type === "show" &&
              data?.Children &&
              data?.Children.size > 1 && (
                <Select
                  sx={{
                    ml: "auto",
                    opacity: page === 1 ? 1 : 0,
                    transition: "all 0.5s ease",
                  }}
                  size="small"
                  value={selectedSeason}
                  onChange={(e) => {
                    if (e.target.value === selectedSeason) return;
                    setSelectedSeason(e.target.value as number);
                  }}
                >
                  {data?.type === "show" &&
                    data?.Children?.Metadata?.map((season, index) => (
                      <MenuItem key={index} value={season.index}>
                        {season.title}
                      </MenuItem>
                    ))}
                </Select>
              )}
          </Box>

          <Divider sx={{ mb: 2, width: "100%" }} />

          <AnimatePresence mode="wait">
            {page === 0 && data && (
              <TitleOverview
                data={data}
                trailer={primaryTrailer}
                onShowDetails={() => setPage(2)}
                onShowReviews={() => setPage(3)}
              />
            )}
            {page === 1 && data?.type === "show" && (
              <EpisodesPage
                data={data}
                episodes={episodes}
                refetchEpisodes={refetchEpisodes}
              />
            )}
            {page === 2 && data && (
              <TitleDetails
                data={data}
                extras={remainingExtras}
                loadingExtras={extrasLoading}
              />
            )}
            {page === 3 && (
              <TitleReviews data={data} />
            )}
            {page === 4 && data && <TitleMedia data={data} />}
          </AnimatePresence>
        </Box>
        {data && capabilities?.canEditMetadata && (
          <EditMetadataDialog
            data={data}
            open={editMetadataOpen}
            onClose={() => setEditMetadataOpen(false)}
            onSaved={metadataWasSaved}
          />
        )}
        {data && capabilities?.canMatch && matchOpen && (
          <MatchMetadataDialog
            item={data}
            open
            onClose={() => setMatchOpen(false)}
            onMatched={async (candidate) => {
              setData((current) =>
                current
                  ? {
                      ...current,
                      guid: candidate.guid,
                      title: candidate.name,
                      year: candidate.year ?? current.year,
                    }
                  : current,
              );
              setNotice("Match applied. Plex is refreshing metadata.");
              try {
                setData(await getMediaMetadata(data.ratingKey));
              } catch {
                // The library cache is invalidated; a later load will fetch it again.
              }
            }}
          />
        )}
        <Snackbar
          open={Boolean(notice)}
          autoHideDuration={4000}
          onClose={() => setNotice(null)}
          message={notice}
        />
      </Box>
    </AppDialog>
  );
}

export default TitleDetailsScreen;

function EpisodesPage({
  data,
  episodes,
  refetchEpisodes,
}: {
  data: Plex.Metadata | undefined;
  episodes: Plex.Metadata[] | null | undefined;
  refetchEpisodes: () => void;
}) {
  const [selectedEpisodes, setSelectedEpisodes] = useState<Plex.Metadata[]>([]);
  const [selectMode, setSelectMode] = useState<boolean>(false);

  useEffect(() => {
    if (!selectMode) setSelectedEpisodes([]);
  }, [selectMode]);

  return (
    <>
      <Collapse in={selectMode}>
        {/* Buttons for marking selected episodes as watched or un-watched and a button for select all */}
        <Box
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "flex-start",
            flexWrap: "wrap",
            gap: { xs: 1, sm: 2 },
            mb: 2,
          }}
        >
          <Button
            variant="contained"
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.2s ease-in-out",
            }}
            onClick={() => {
              setSelectMode(false);
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.2s ease-in-out",
            }}
            onClick={() => {
              if (selectedEpisodes.length === episodes?.length) {
                setSelectedEpisodes([]);
              } else {
                setSelectedEpisodes(episodes ?? []);
              }
            }}
          >
            {selectedEpisodes.length === episodes?.length
              ? "Unselect All"
              : "Select All"}
          </Button>

          <Button
            variant="contained"
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.2s ease-in-out",
            }}
            onClick={async () => {
              useConfirmModal.getState().setModal({
                title: `Mark as watched`,
                message: `Are you sure you want to mark ${selectedEpisodes.length} episodes as watched?`,
                onConfirm: async () => {
                  await Promise.all(
                    selectedEpisodes.map((episode) =>
                      setMediaPlayedStatus(true, episode.ratingKey),
                    ),
                  );
                  refetchEpisodes();
                  setSelectMode(false);
                },
                onCancel: () => {},
              });
            }}
          >
            Mark as Watched
          </Button>
          <Button
            variant="contained"
            sx={{
              fontWeight: "bold",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              transition: "all 0.2s ease-in-out",
            }}
            onClick={async () => {
              useConfirmModal.getState().setModal({
                title: `Mark as unwatched`,
                message: `Are you sure you want to mark ${selectedEpisodes.length} episodes as unwatched?`,
                onConfirm: async () => {
                  await Promise.all(
                    selectedEpisodes.map((episode) =>
                      setMediaPlayedStatus(false, episode.ratingKey),
                    ),
                  );
                  refetchEpisodes();
                  setSelectMode(false);
                },
                onCancel: () => {},
              });
            }}
          >
            Mark as Unwatched
          </Button>
        </Box>
      </Collapse>
      {data?.type === "show" && !episodes && (
        <Box
          sx={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            mt: 10,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      {data?.type === "show" && episodes && (
        <Box
          component={motion.div}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          sx={{
            width: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            gap: 1,
          }}
        >
          {episodes?.map((episode) => (
            <EpisodeItem
              key={episode.ratingKey}
              item={episode}
              refetchData={refetchEpisodes}
              selected={selectedEpisodes.some(
                (selected) => selected.ratingKey === episode.ratingKey,
              )}
              setSelected={() => {
                if (
                  selectedEpisodes.some(
                    (selected) => selected.ratingKey === episode.ratingKey,
                  )
                ) {
                  setSelectedEpisodes(
                    selectedEpisodes.filter(
                      (selected) => selected.ratingKey !== episode.ratingKey,
                    ),
                  );
                } else {
                  setSelectedEpisodes([...selectedEpisodes, episode]);
                }
              }}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
            />
          ))}
        </Box>
      )}
    </>
  );
}

function EpisodeItem({
  item: sourceItem,
  refetchData,
  selected,
  setSelected,
  selectMode,
  setSelectMode,
}: {
  item: Plex.Metadata;
  refetchData: () => void;
  selected?: boolean;
  setSelected?: (selected: boolean) => void;
  selectMode?: boolean;
  setSelectMode?: (selectMode: boolean) => void;
}): JSX.Element {
  const [item, setItem] = useState(sourceItem);
  const canManageServer = useCanManageServer();
  const capabilities = getMediaActionCapabilities(item, {
    localItem: true,
    canManageServer,
    allowDownloads: false,
  });
  useEffect(() => setItem(sourceItem), [sourceItem]);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
  } | null>(null);

  const handlePlay = async () => {
    if (!item) return;
    navigate(`/watch/${item.ratingKey}`);
  };

  const handleClose = () => {
    setContextMenu(null);
  };

  const markWatched = (watched: boolean) => {
    const label = watched ? "Watched" : "Unwatched";
    useConfirmModal.getState().setModal({
      title: `Mark as ${label}`,
      message: `Are you sure you want to mark "${item.title}" as ${label}?`,
      onConfirm: async () => {
        await setMediaPlayedStatus(watched, item.ratingKey);
        setItem((current) =>
          current.ratingKey === item.ratingKey
            ? applyMediaWatchedState(current, watched)
            : current,
        );
        handleClose();
        refetchData?.();
      },
      onCancel: handleClose,
    });
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      mouseX: event.clientX - 2,
      mouseY: event.clientY - 4,
    });
  };

  const navigate = useNavigate();

  return (
    <>
      <Menu
        open={contextMenu !== null}
        onClose={handleClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
      >
        <Typography
          sx={{
            fontSize: "1rem",
            fontWeight: "bold",
            px: 1,
            maxWidth: "200px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          EP.{item.index}: {item.title}
        </Typography>

        <Divider
          sx={{
            my: 1,
          }}
        />

        <MenuItem
          onClick={async (e) => {
            e.stopPropagation();
            await handlePlay();
            handleClose();
          }}
        >
          <ListItemIcon>
            <PlayArrowRounded fontSize="small" />
          </ListItemIcon>
          Play
        </MenuItem>
        {renderMediaListMenuItems({
          capabilities,
          onSelect: (kind) => {
            handleClose();
            openMediaListDialog(kind, item);
          },
        })}
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            if (setSelectMode) setSelectMode(!selectMode);
            if (setSelected) setSelected(!selected);
            handleClose();
          }}
        >
          <ListItemIcon>
            {selectMode ? (
              <CheckBoxRounded fontSize="small" />
            ) : (
              <CheckBoxOutlineBlankRounded fontSize="small" />
            )}
          </ListItemIcon>
          {selectMode ? "Disable Selection" : "Enable Selection"}
        </MenuItem>

        <Divider
          sx={{
            my: 1,
          }}
        />

        <MenuItem onClick={() => markWatched(true)}>
          <ListItemIcon>
            <CheckCircleRounded fontSize="small" />
          </ListItemIcon>
          Mark as Watched
        </MenuItem>
        <MenuItem onClick={() => markWatched(false)}>
          <ListItemIcon>
            <CheckCircleOutlineRounded fontSize="small" />
          </ListItemIcon>
          Mark as Unwatched
        </MenuItem>
      </Menu>
      <Box
        sx={{
          width: "100%",
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "flex-start",
          gap: 2,
          userSelect: "none",
          cursor: "pointer",
          borderRadius: "10px",
          p: 1.5,
          mb: 1,
          transition: "all 0.5s ease",
          position: "relative",
          "&:hover": {
            backgroundColor: (theme) =>
              alpha(theme.palette.background.paper, 0.5),
            transition: "all 0.2s ease",
          },

          // on hover get the 2nd child and then the 1st child of that
          "&:hover > :nth-child(2)": {
            "& > :nth-child(1)": {
              opacity: 1,
              transition: "all 0.2s ease-in",
            },
          },
        }}
        onContextMenu={handleContextMenu}
      >
        <StretchedLink to={mediaWatchTo(item)} label={`Play ${item.title}`} />
        <Box
          sx={{
            minWidth: { xs: "30px", sm: "40px" },
            width: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
            position: "relative",
            zIndex: 2,
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {!selectMode && (
            <Typography
              sx={{
                fontSize: { xs: "1rem", sm: "1.25rem" },
                fontWeight: "bold",
                color: (theme) => theme.palette.text.primary,
                textAlign: "center",
              }}
            >
              {item.index}
            </Typography>
          )}

          {selectMode && (
            <Checkbox
              checked={selected}
              onChange={() => {
                if (setSelected) setSelected(!selected);
              }}
            />
          )}
        </Box>

        <Box
          sx={{
            width: { xs: "120px", sm: "20%" },
            flexShrink: 0,
            borderRadius: "8px",
            aspectRatio: "16/9",
            backgroundImage: `url(${getTranscodeImageURL(
              item.thumb,
              380,
              214,
            )})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundBlendMode: "darken",
            overflow: "hidden",
            whiteSpace: "nowrap",
            transition: "all 0.3s ease",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            position: "relative",
            boxShadow: (theme) =>
              `0 4px 6px -1px ${alpha(theme.palette.common.black, 0.2)}`,
          }}
        >
          <PlayArrowRounded
            sx={{
              color: "#FFFFFF",
              fontSize: "400%",
              m: "auto",
              opacity: 0,
              backgroundColor: "#00000088",
              borderRadius: "50%",
              transition: "all 0.3s ease-out",
            }}
          />

          <Tooltip title="More actions">
            <IconButton
              aria-label={`More actions for ${item.title}`}
              aria-haspopup="menu"
              aria-expanded={Boolean(contextMenu)}
              size="small"
              sx={{
                position: "absolute",
                top: 4,
                right: 4,
                zIndex: 2,
                bgcolor: "rgba(18,25,39,0.8)",
                color: "#fff",
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                const bounds = event.currentTarget.getBoundingClientRect();
                setContextMenu({ mouseX: bounds.left, mouseY: bounds.bottom });
              }}
            >
              <MoreVertRounded fontSize="small" />
            </IconButton>
          </Tooltip>

          {(item.viewOffset || isMediaWatched(item)) && (
            <LinearProgress
              value={
                item.viewOffset ? (item.viewOffset / item.duration) * 100 : 100
              }
              variant="determinate"
              sx={{
                width: "100%",
                height: "4px",
                backgroundColor: (theme) =>
                  alpha(theme.palette.common.black, 0.5),

                position: "absolute",
                bottom: 0,
                "& .MuiLinearProgress-bar": {
                  backgroundColor: (theme) => theme.palette.primary.main,
                },
              }}
            />
          )}
        </Box>

        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            justifyContent: "flex-start",
            ml: 1,
            minWidth: 0,
          }}
        >
          <Box
            sx={{
              width: "100%",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: "1rem", sm: "1.5rem" },
                fontWeight: "bold",
                color: (theme) => theme.palette.text.primary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                display: "-webkit-box",
                WebkitLineClamp: 1,
                WebkitBoxOrient: "vertical",
                flex: 1,
                mr: 1,
              }}
            >
              {item.title}
            </Typography>

            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 1,
                color: (theme) => theme.palette.text.secondary,
                whiteSpace: "nowrap",
                flexShrink: 0,
                fontSize: { xs: "0.85rem", sm: "1rem" },
              }}
            >
              {durationInMinutes(item.duration)} Min.
            </Box>
          </Box>

          <Typography
            sx={{
              fontSize: { xs: "0.85rem", sm: "1rem" },
              fontWeight: "light",
              color: (theme) => theme.palette.text.secondary,
              mt: 0.5,
              // make it so the text doesnt resize the parent nor overflow max 3 rows
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: { xs: 2, sm: 3 },
              WebkitBoxOrient: "vertical",
            }}
            title={item.summary}
          >
            {item.summary}
          </Typography>
        </Box>
      </Box>
    </>
  );
}

function TabButton({
  text,
  onClick,
  selected,
}: {
  text: string;
  onClick: (event: React.MouseEvent) => void;
  selected: boolean;
}) {
  return (
    <Typography
      sx={{
        fontSize: { xs: "0.85rem", sm: "1.25rem" },
        fontWeight: "bold",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        whiteSpace: "nowrap",
        flexShrink: 0,
        color: selected
          ? (theme) => theme.palette.primary.main
          : (theme) => theme.palette.text.disabled,
        cursor: "pointer",
        userSelect: "none",
        position: "relative",
        pb: 0.5,

        "&:after": {
          content: '""',
          position: "absolute",
          bottom: 0,
          left: 0,
          width: selected ? "100%" : "0%",
          height: "2px",
          backgroundColor: (theme) => theme.palette.primary.main,
          transition: "all 0.3s ease",
        },

        "&:hover": {
          color: (theme) =>
            selected ? theme.palette.primary.main : theme.palette.text.primary,

          "&:after": {
            width: "100%",
          },
        },

        transition: "all 0.3s ease",
      }}
      onClick={onClick}
    >
      {text}
    </Typography>
  );
}
