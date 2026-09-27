import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  ListItemIcon,
  Menu,
  MenuItem,
  Paper,
  Popover,
  Rating,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import { useNavigate, useSearchParams } from "react-router-dom";
import React, { JSX, useEffect, useState } from "react";
import {
  getLibraryMeta,
  getLibraryMetaChildren,
  getTranscodeImageURL,
  setMediaPlayedStatus,
  setMediaRating,
} from "../plex";
import {
  CheckCircleRounded,
  PlayArrowRounded,
  CheckCircleOutlineRounded,
  StarRounded,
  StarOutlineRounded,
  CheckBoxOutlineBlankRounded,
  CheckBoxRounded,
  EditRounded,
} from "@mui/icons-material";
import { durationToText } from "./MovieItemSlider";
import { HeroWatchListButton } from "./MovieItem";
import { alpha } from "@mui/material/styles";
import { AnimatePresence, motion } from "framer-motion";
import { useConfirmModal } from "./ConfirmModal";
import { PlexCommunity } from "../plex/plexCommunity";
import moment from "moment";
import AddReviewModal from "./modals/AddReviewModal";
import { getNevuReviews } from "../common/NevuReviews";
import TitleOverview from "./title/TitleOverview";
import TitleDetails from "./title/TitleDetails";
import TitleMedia from "./title/TitleMedia";
import EditMetadataDialog from "./title/EditMetadataDialog";
import OriginalDownloadButton from "./title/OriginalDownloadButton";
import {
  applyMetadataUpdate,
  MetadataLockUpdate,
  MetadataUpdate,
} from "../plex/metadata";
import {
  withoutExtra,
} from "../plex/discover";
import { getTrackChoices } from "../plex/mediaVersions";
import { useCanManageServer } from "../states/ServerAccess";
import { useTitleExtras } from "../hooks/useTitleExtras";
import ExpandableDescription from "./ExpandableDescription";
import AppDialog from "./AppDialog";

const DESKTOP_HERO_HEIGHT = "clamp(560px, 93.333vh, 960px)";

function trackLanguages(data: Plex.Metadata, streamType: 2 | 3) {
  return Array.from(
    new Set(
      getTrackChoices(data, streamType)
        .map(({ stream }) => stream.language || stream.displayTitle)
        .filter(Boolean),
    ),
  );
}

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
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 700 }}>{score}</Typography>
    </Box>
  );
}

function MetaScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const canManageServer = useCanManageServer();
  const posterRef = React.useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<Plex.Metadata | undefined>(undefined);

  const [page, setPage] = useState<number>(0);
  const [reviewRevision, setReviewRevision] = useState(0);

  const [selectedSeason, setSelectedSeason] = useState<number>(0);
  const [episodes, setEpisodes] = useState<Plex.Metadata[] | null>();

  const [languages, setLanguages] = useState<string[] | null>(null);
  const [subTitles, setSubTitles] = useState<string[] | null>(null);

  const [editMetadataOpen, setEditMetadataOpen] = useState(false);
  const [metadataSaved, setMetadataSaved] = useState(false);
  const {
    extras,
    loading: extrasLoading,
    primaryTrailer,
  } = useTitleExtras(data);

  const mid = searchParams.get("mid");

  useEffect(() => {
    setData(undefined);
    setLoading(true);
    setEpisodes(null);
    setSelectedSeason(0);
    setLanguages(null);
    setSubTitles(null);
    setPage(0);
    setEditMetadataOpen(false);
    setMetadataSaved(false);

    if (!mid) return;
    getLibraryMeta(mid).then((res) => {
      const seasons = [...(res.Children?.Metadata || [])];
      setSelectedSeason(
        res.OnDeck?.Metadata?.parentIndex ??
          seasons.sort((a, b) => {
            // if the index is 0 put it at the end
            if (a.index === 0) return 1;
            if (b.index === 0) return -1;
            // sort by index
            return a.index - b.index;
          })?.[0]?.index ??
          1
      );
      setData(res);
      setLoading(false);
    });
  }, [mid]);

  useEffect(() => {
    if (languages || subTitles) return;
    if (!data) return;

    switch (data.type) {
      case "show":
        {
          if (!episodes) return;

          // get the first episode to get the languages and subtitles
          const firstEpisode = episodes[0];

          // you need to request the full metadata for the episode to get the media info
          getLibraryMeta(firstEpisode.ratingKey).then((res) => {
            setLanguages(trackLanguages(res, 2));
            setSubTitles(trackLanguages(res, 3));
          });
        }
        break;
      case "movie":
        {
          setLanguages(trackLanguages(data, 2));
          setSubTitles(trackLanguages(data, 3));
        }
        break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.ratingKey, episodes]);

  useEffect(() => {
    setEpisodes(null);
    if (!data) return;

    const season = data?.Children?.Metadata?.find(
      (child) => child.index === selectedSeason
    );

    console.log("Loading data for season", season);

    if (data?.type === "show" && season?.ratingKey) {
      getLibraryMetaChildren(season?.ratingKey as string).then((res) => {
        setEpisodes(res);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeason, data]);

  const refetchEpisodes = () => {
    if (!data) return;

    const season = data?.Children?.Metadata?.find(
      (child) => child.index === selectedSeason
    );

    if (data?.type === "show" && season?.ratingKey) {
      getLibraryMetaChildren(season?.ratingKey as string).then((res) => {
        setEpisodes(res);
      });
    }
  };

  const remainingExtras = withoutExtra(extras, primaryTrailer);
  const directors = (data?.Director || [])
    .map(({ tag }) => tag)
    .filter(Boolean)
    .join(", ");

  const metadataWasSaved = (
    changes: MetadataUpdate,
    lockChanges: MetadataLockUpdate,
  ) => {
    setData((current) =>
      current ? applyMetadataUpdate(current, changes, lockChanges) : current,
    );
    setMetadataSaved(true);

    if (mid)
      void getLibraryMeta(mid)
        .then((metadata) => setData(metadata))
        .catch(() => undefined);
  };

  if (!searchParams.has("mid")) return <></>;

  if (loading)
    return (
      <AppDialog
        open
        onClose={() => setSearchParams(new URLSearchParams())}
        contentSx={{ p: 0 }}
      >
        <Box sx={{ minHeight: "50vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <CircularProgress />
        </Box>
      </AppDialog>
    );

  // const selectedSeasonData = data?.Children?.Metadata.find(
  //   (season) => season.index === selectedSeason
  // );

  return (
    <AppDialog
      open={searchParams.has("mid")}
      onClose={() => setSearchParams(new URLSearchParams())}
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
            backgroundImage: `url(${getTranscodeImageURL(
              data?.art as string,
              1920,
              1080
            )})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundColor: "#000000AA",
            backgroundBlendMode: "darken",

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
            }}
          >
            <img
              src={`${getTranscodeImageURL(data?.thumb as string, 600, 900)}`}
              alt={data?.title || ""}
              style={{
                width: "100%",
                aspectRatio: "2/3",
                backgroundColor: "#00000088",
                objectFit: "cover",
                display: "block",
              }}
            />
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
                {data?.type === "show" &&
                  data?.leafCount === data?.viewedLeafCount && (
                    <CheckCircleRounded
                      sx={{
                        color: (theme) => theme.palette.primary.light,
                        fontSize: "large",
                      }}
                    />
                  )}
                {data?.type === "movie" && (data?.viewCount ?? 0) > 0 && (
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
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: { xs: "center", sm: "flex-start" },
                  flexWrap: "wrap",
                  gap: { xs: 1, sm: 2 },
                  mt: 2,
                }}
              >
                <Button
                  variant="contained"
                  sx={{
                    height: "38px",
                    fontWeight: "bold",
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    gap: 1,
                    transition: "all 0.2s ease-in-out",
                  }}
                  onClick={async () => {
                    if (data?.type === "movie")
                      navigate(
                        `/watch/${data?.ratingKey}${
                          data?.viewOffset ? `?t=${data?.viewOffset}` : ""
                        }`
                      );

                    if (data?.type === "show") {
                      if (data?.OnDeck && data?.OnDeck.Metadata) {
                        navigate(
                          `/watch/${data?.OnDeck.Metadata.ratingKey}${
                            data?.OnDeck.Metadata.viewOffset
                              ? `?t=${data?.OnDeck.Metadata.viewOffset}`
                              : ""
                          }`
                        );
                      } else {
                        const firstSeason = await getLibraryMetaChildren(
                          data?.Children?.Metadata[0]?.ratingKey as string
                        );

                        if (firstSeason)
                          navigate(`/watch/${firstSeason[0].ratingKey}`);
                      }
                    }
                  }}
                >
                  <PlayArrowRounded fontSize="medium" /> Play{" "}
                  {data?.type === "show" &&
                    data?.OnDeck &&
                    data?.OnDeck.Metadata &&
                    `${
                      data?.Children?.size && data?.Children?.size > 1
                        ? `S${data?.OnDeck.Metadata.parentIndex}`
                        : ""
                    }E${data?.OnDeck.Metadata.index}`}
                </Button>

                {data && <OriginalDownloadButton data={data} />}

                <Tooltip placement="top" arrow title="Watchlist">
                  <HeroWatchListButton item={data as Plex.Metadata} />
                </Tooltip>

                {canManageServer && (
                  <Tooltip placement="top" arrow title="Edit metadata">
                    <IconButton
                      aria-label="Edit metadata"
                      onClick={() => setEditMetadataOpen(true)}
                      sx={{
                        width: 38,
                        height: 38,
                        borderRadius: 1,
                        bgcolor: "rgba(18, 25, 39, 0.8)",
                        border: "1px solid rgba(255,255,255,0.2)",
                      }}
                    >
                      <EditRounded fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}

                {data && (
                  <RatingButton
                    item={data}
                    onReviewChanged={() => setReviewRevision((value) => value + 1)}
                  />
                )}

                <Tooltip
                  placement="top"
                  arrow
                  title={
                    `Mark as ` +
                    (data?.type === "movie"
                      ? !Boolean(data?.viewCount)
                        ? "watched"
                        : "unwatched"
                      : data?.viewedLeafCount === data?.leafCount
                      ? "unwatched"
                      : "watched")
                  }
                >
                  <Button
                    variant="contained"
                    sx={{
                      height: "38px",
                      fontWeight: "bold",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      transition: "all 0.2s ease-in-out",
                      display: "flex",
                      gap: 1,
                    }}
                    onClick={async () => {
                      if (!data) return;
                      let state = "unwatched";

                      if (data?.type === "movie" && (data?.viewCount ?? 0) > 0)
                        state = "watched";
                      if (
                        data?.type === "show" &&
                        data?.viewedLeafCount === data?.leafCount
                      )
                        state = "watched";

                      useConfirmModal.getState().setModal({
                        title: `Mark as ${
                          state === "unwatched" ? "watched" : "unwatched"
                        }`,
                        message: `Are you sure you want to mark ${
                          data?.title
                        } as ${
                          state === "unwatched" ? "watched" : "unwatched"
                        }?`,
                        onConfirm: async () => {
                          switch (data.type) {
                            case "movie":
                              data.viewCount = !Boolean(data.viewCount) ? 1 : 0;
                              setData({ ...data });
                              await setMediaPlayedStatus(
                                Boolean(data.viewCount),
                                data.ratingKey
                              );
                              break;
                            case "show":
                              const newViewedLeafCount =
                                data.viewedLeafCount === data.leafCount
                                  ? 0
                                  : data.leafCount;
                              data.viewedLeafCount = newViewedLeafCount;
                              setData({ ...data });
                              await setMediaPlayedStatus(
                                newViewedLeafCount === data.leafCount,
                                data.ratingKey
                              );
                              break;
                            default:
                              break;
                          }
                        },
                        onCancel: () => {},
                      });
                    }}
                  >
                    {data?.type === "movie" ? (
                      !((data?.viewCount ?? 0) > 0) ? (
                        <CheckCircleOutlineRounded fontSize="small" />
                      ) : (
                        <CheckCircleRounded fontSize="small" />
                      )
                    ) : data?.type === "show" ? (
                      data?.viewedLeafCount === data?.leafCount ? (
                        <CheckCircleRounded fontSize="small" />
                      ) : (
                        <CheckCircleOutlineRounded fontSize="small" />
                      )
                    ) : null}
                  </Button>
                </Tooltip>
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
                <Typography color="text.secondary">Genres: </Typography>
                {data?.Genre?.slice(0, 5).map((genre, index) => (
                  <Typography
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
                    }}
                    onClick={() => {
                      setSearchParams(
                        new URLSearchParams({
                          bkey: `/library/sections/${data?.librarySectionID}/genre/${genre.id}`,
                        })
                      );
                    }}
                  >
                    {genre.tag}
                    {index + 1 === data?.Genre?.slice(0, 5).length ? "" : ","}
                  </Typography>
                ))}
              </Box>

              <Collapse in={Boolean(languages || subTitles)}>
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
                        <Typography color="text.secondary">Audio: </Typography>
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
                    {subTitles && subTitles.length > 0 && (
                      <>
                        <Typography color="text.secondary">
                          Subtitles:{" "}
                        </Typography>
                        {subTitles.slice(0, 10).map((lang, index) => (
                          <Typography
                            key={index}
                            sx={{
                              color: (theme) => theme.palette.text.primary,
                              fontWeight: "medium",
                            }}
                          >
                            {lang}
                            {index + 1 === subTitles.slice(0, 10).length
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
                navigate={navigate}
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
              <MetaPageReviews data={data} revision={reviewRevision} />
            )}
            {page === 4 && data && <TitleMedia data={data} />}
          </AnimatePresence>
        </Box>
        {data && canManageServer && (
          <EditMetadataDialog
            data={data}
            open={editMetadataOpen}
            onClose={() => setEditMetadataOpen(false)}
            onSaved={metadataWasSaved}
          />
        )}
        <Snackbar
          open={metadataSaved}
          autoHideDuration={4000}
          onClose={() => setMetadataSaved(false)}
          message="Metadata saved"
        />
      </Box>
    </AppDialog>
  );
}

export default MetaScreen;

function EpisodesPage({
  data,
  episodes,
  refetchEpisodes,
  navigate,
}: {
  data: Plex.Metadata | undefined;
  episodes: Plex.Metadata[] | null | undefined;
  refetchEpisodes: () => void;
  navigate: (path: string) => void;
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
                    selectedEpisodes.map(async (episode) => {
                      setMediaPlayedStatus(true, episode.ratingKey);
                    })
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
                    selectedEpisodes.map(async (episode) => {
                      await setMediaPlayedStatus(false, episode.ratingKey);
                    })
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
              item={episode}
              refetchData={refetchEpisodes}
              selected={selectedEpisodes.some(
                (selected) => selected.ratingKey === episode.ratingKey
              )}
              setSelected={() => {
                if (
                  selectedEpisodes.some(
                    (selected) => selected.ratingKey === episode.ratingKey
                  )
                ) {
                  setSelectedEpisodes(
                    selectedEpisodes.filter(
                      (selected) => selected.ratingKey !== episode.ratingKey
                    )
                  );
                } else {
                  setSelectedEpisodes([...selectedEpisodes, episode]);
                }
              }}
              selectMode={selectMode}
              setSelectMode={setSelectMode}
              onClick={() => {
                navigate(
                  `/watch/${episode.ratingKey}${
                    episode.viewOffset ? `?t=${episode.viewOffset} ` : ""
                  }`
                );
              }}
            />
          ))}
        </Box>
      )}
    </>
  );
}

function MetaPageReviews({
  data,
  revision,
}: {
  data: Plex.Metadata | undefined;
  revision: number;
}) {
  const [reviews, setReviews] = useState<
    | {
        plexReviews: PlexCommunity.ReviewsData | null;
        nevuReviews: PerPlexed.Reviews.Review[];
      }
    | null
  >(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadWarning, setLoadWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!data) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadWarning(null);
    const metaID = data.guid.split("/").pop();
    if (!metaID) {
      setLoadWarning("This item does not have a valid Plex metadata identifier.");
      setLoading(false);
      return;
    }

    Promise.allSettled([
      PlexCommunity.getUserReviews(metaID),
      getNevuReviews(data.guid),
    ]).then(([plexResult, nevuResult]) => {
      if (cancelled) return;
      let plexReviews =
        plexResult.status === "fulfilled" ? plexResult.value : null;
      const nevuReviews =
        nevuResult.status === "fulfilled" ? nevuResult.value : [];

      if (plexReviews) {
        const topReviewIDs = new Set(
          plexReviews.topReviews?.nodes.map(({ id }) => id) || [],
        );
        plexReviews = {
          ...plexReviews,
          recentReviews: {
            ...plexReviews.recentReviews,
            nodes:
              plexReviews.recentReviews?.nodes.filter(
                ({ id }) => !topReviewIDs.has(id),
              ) || [],
          },
        };
      }

      if (!plexReviews && nevuResult.status === "rejected")
        setLoadWarning("Community and Nevu reviews are temporarily unavailable.");
      else if (!plexReviews)
        setLoadWarning("Plex community reviews are temporarily unavailable.");
      else if (nevuResult.status === "rejected")
        setLoadWarning(
          nevuResult.reason instanceof Error
            ? nevuResult.reason.message
            : "Nevu reviews are temporarily unavailable.",
        );

      setReviews({ plexReviews, nevuReviews });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [data, revision]);

  const renderReviewsSection = (
    title: string,
    reviewNodes: any[] | undefined,
    isEmpty: boolean,
    isNevu: boolean = false
  ) => {
    if (isEmpty) return null;
    return (
      <Box sx={{ width: "100%", mb: 5 }}>
        <Typography
          variant="h6"
          fontWeight="bold"
          color="text.primary"
          sx={{ mb: 2 }}
        >
          {title}
        </Typography>

        {reviewNodes && reviewNodes.length > 0 ? (
          <Grid container spacing={3} sx={{ width: "100%" }}>
            {reviewNodes?.map((review, index) => {
              const username = isNevu
                ? (review as PerPlexed.Reviews.Review).user.username
                : (review as PlexCommunity.ActivityReview).userV2?.username;

              const avatarSrc = isNevu
                ? (review as PerPlexed.Reviews.Review).user.avatar
                : (review as PlexCommunity.ActivityReview).userV2?.avatar;

              const hasSpoilers = isNevu
                ? (review as PerPlexed.Reviews.Review).spoilers
                : (review as PlexCommunity.ActivityReview).hasSpoilers;

              const reviewDate = isNevu
                ? (review as PerPlexed.Reviews.Review).created_at
                : (review as PlexCommunity.ActivityReview).date;
              const message =
                typeof review.message === "string" &&
                !["No text provided", "No review text provided"].includes(
                  review.message,
                )
                  ? review.message
                  : "";

              return (
                <Grid size={{ xs: 12, sm: 6, md: 4 }} key={title + index}>
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2.5,
                      bgcolor: (theme) =>
                        alpha(theme.palette.background.paper, 0.4),
                      borderRadius: 2,
                      height: "100%",
                      transition: "all 0.2s ease",
                      "&:hover": {
                        bgcolor: (theme) =>
                          alpha(theme.palette.background.paper, 0.6),
                        transform: "translateY(-4px)",
                        boxShadow: (theme) =>
                          `0 8px 16px -2px ${alpha(
                            theme.palette.common.black,
                            0.15
                          )}`,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1.5,
                        mb: 2,
                        position: "relative",
                      }}
                    >
                      <Avatar
                        src={avatarSrc}
                        sx={{ width: 42, height: 42, boxShadow: 1 }}
                      >
                        {username?.charAt(0) || "U"}
                      </Avatar>
                      <Box sx={{ flex: 1 }}>
                        <Stack
                          spacing={0.5}
                          justifyContent={"flex-start"}
                          direction={"row"}
                          alignItems="center"
                        >
                          <Typography fontWeight="medium" noWrap>
                            {username || "Anonymous User"}
                          </Typography>
                          {review.visibility === "GLOBAL" && (
                            <Chip label="Global" size="small" color="info" />
                          )}
                          {review.visibility === "LOCAL" && (
                            <Chip label="Local" size="small" color="info" />
                          )}
                        </Stack>

                        <Box sx={{ display: "flex", alignItems: "center" }}>
                          <Rating
                            value={(review.reviewRating ?? review.rating) / 2}
                            precision={0.5}
                            size="small"
                            readOnly
                            sx={{
                              color: (theme) => theme.palette.primary.main,
                            }}
                          />
                          <Typography
                            variant="caption"
                            sx={{ ml: 1, color: "text.secondary" }}
                          >
                            {moment(new Date(reviewDate)).fromNow()}
                          </Typography>
                        </Box>
                      </Box>
                    </Box>

                    {message && (
                      <>
                        <Divider sx={{ mb: 2 }} />
                        <Typography
                          sx={{
                            fontSize: "0.95rem",
                            color: "text.secondary",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            display: "-webkit-box",
                            WebkitLineClamp: 5,
                            WebkitBoxOrient: "vertical",
                            lineHeight: 1.6,

                            ...(hasSpoilers && {
                              filter: "blur(10px)",
                              transition: "filter 0.2s ease",
                              "&:hover": {
                                filter: "blur(0)",
                                transition: "filter 3s ease",
                              },
                            }),
                          }}
                        >
                          {message}
                        </Typography>
                      </>
                    )}
                  </Paper>
                </Grid>
              );
            })}
          </Grid>
        ) : (
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              py: 4,
              width: "100%",
              bgcolor: (theme) => alpha(theme.palette.background.paper, 0.2),
              borderRadius: 2,
            }}
          >
            <Typography color="text.secondary" variant="body2">
              No reviews available in this category
            </Typography>
          </Box>
        )}
      </Box>
    );
  };

  const totalReviews =
    (data?.Review?.length ?? 0) +
    (reviews?.plexReviews?.topReviews?.nodes.length ?? 0) +
    (reviews?.plexReviews?.friendReviews?.nodes.length ?? 0) +
    (reviews?.plexReviews?.recentReviews?.nodes.length ?? 0) +
    (reviews?.nevuReviews?.length ?? 0);

  return (
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
        gap: 4,
        userSelect: "none",
      }}
    >
      {totalReviews === 0 && !loading && (
        <Typography>No one has reviewed this title yet.</Typography>
      )}

      {loadWarning && (
        <Alert severity="warning" sx={{ width: "100%" }}>
          {loadWarning}
        </Alert>
      )}

      {(data?.Review?.length ?? 0) > 0 && (
        <Box sx={{ width: "100%" }}>
          <Typography variant="h6" fontWeight="bold" sx={{ mb: 2 }}>
            Critic reviews
          </Typography>
          <Grid container spacing={3} sx={{ width: "100%" }}>
            {data?.Review?.map((review) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={review.id}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 2.5,
                    bgcolor: (theme) =>
                      alpha(theme.palette.background.paper, 0.4),
                    height: "100%",
                  }}
                >
                  <Typography fontWeight="bold">{review.tag}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                    {review.source}
                  </Typography>
                  <Typography sx={{ lineHeight: 1.6 }}>{review.text}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {loading ? (
        <Grid container spacing={3} sx={{ width: "100%" }}>
          {[1, 2, 3].map((item) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item}>
              <Box
                sx={{
                  p: 2,
                  bgcolor: (theme) =>
                    alpha(theme.palette.background.paper, 0.4),
                  borderRadius: 2,
                  height: "100%",
                }}
              >
                <Box
                  sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}
                >
                  <Skeleton variant="circular" width={40} height={40} />
                  <Box sx={{ flex: 1 }}>
                    <Skeleton variant="text" width="70%" height={24} />
                    <Skeleton variant="text" width="40%" height={20} />
                  </Box>
                </Box>
                <Skeleton variant="text" />
                <Skeleton variant="text" />
                <Skeleton variant="text" width="80%" />
              </Box>
            </Grid>
          ))}
        </Grid>
      ) : !reviews && (data?.Review?.length ?? 0) === 0 ? (
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            py: 6,
            width: "100%",
            bgcolor: (theme) => alpha(theme.palette.background.paper, 0.2),
            borderRadius: 2,
          }}
        >
          <StarOutlineRounded
            sx={{ fontSize: 60, color: "text.disabled", mb: 2 }}
          />
          <Typography color="text.secondary" variant="body1">
            No reviews available for this title yet
          </Typography>
        </Box>
      ) : reviews ? (
        <Box sx={{ width: "100%" }}>
          {renderReviewsSection(
            "NEVU Reviews",
            reviews.nevuReviews,
            !reviews.nevuReviews.length,
            true
          )}

          {renderReviewsSection(
            "Recent Reviews",
            reviews.plexReviews?.recentReviews?.nodes,
            !reviews.plexReviews?.recentReviews?.nodes.length
          )}

          {renderReviewsSection(
            "Top Reviews",
            reviews.plexReviews?.topReviews?.nodes,
            !reviews.plexReviews?.topReviews?.nodes.length
          )}

          {renderReviewsSection(
            "Friend Reviews",
            reviews.plexReviews?.friendReviews?.nodes,
            !reviews.plexReviews?.friendReviews?.nodes.length
          )}
        </Box>
      ) : null}
    </Box>
  );
}

function RatingButton({
  item,
  onReviewChanged,
}: {
  item: Plex.Metadata;
  onReviewChanged?: () => void;
}): JSX.Element {
  const [rating, setRating] = useState<number | null>(
    (item.userRating && item.userRating / 2) ?? null
  );

  const [addReviewModalOpen, setAddReviewModalOpen] = useState<boolean>(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  return (
    <>
      {addReviewModalOpen && item && (
        <AddReviewModal
          item={item}
          onClose={() => setAddReviewModalOpen(false)}
          onChanged={(value) => {
            setRating(value);
            item.userRating = value ? value * 2 : undefined;
            onReviewChanged?.();
          }}
        />
      )}
      <Popover
        anchorEl={anchorEl}
        open={anchorEl !== null}
        onClick={() => {
          setAnchorEl(null);
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        sx={{
          "& .MuiPopover-paper": {
            padding: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 1,
            backgroundColor: (theme) => theme.palette.background.paper,
          },
        }}
      >
        <Rating
          name="simple-controlled"
          value={rating}
          precision={0.5}
          size="large"
          onChange={(e, v) => {
            setRating(v);

            if (v === null) return;

            item.rating = v * 2;
            setMediaRating(v * 2, item.ratingKey);
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setRating(null);
            item.rating = undefined;
            setMediaRating(-1, item.ratingKey);
          }}
        />

        <Button
          variant="contained"
          size="small"
          onClick={() => {
            setAddReviewModalOpen(true);
            setAnchorEl(null);
          }}
        >
          Add Review
        </Button>
      </Popover>
      <Button
        variant="contained"
        sx={{
          height: "38px",
          fontWeight: "bold",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          transition: "all 0.2s ease-in-out",
          display: "flex",
          gap: 1,
        }}
        onClick={(e) => {
          setAnchorEl(e.currentTarget);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setRating(null);
          item.rating = undefined;
          setMediaRating(-1, item.ratingKey);
        }}
      >
        {rating ? (
          <StarRounded fontSize="small" />
        ) : (
          <StarOutlineRounded fontSize="small" />
        )}
      </Button>
    </>
  );
}

function EpisodeItem({
  item,
  onClick,
  refetchData,
  selected,
  setSelected,
  selectMode,
  setSelectMode,
}: {
  item: Plex.Metadata;
  onClick?: (event: React.MouseEvent) => void;
  refetchData: () => void;
  selected?: boolean;
  setSelected?: (selected: boolean) => void;
  selectMode?: boolean;
  setSelectMode?: (selectMode: boolean) => void;
}): JSX.Element {
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

        <MenuItem
          onClick={async () => {
            if (!item) return;

            useConfirmModal.getState().setModal({
              title: `Mark as Watched`,
              message: `Are you sure you want to mark "${item.title}" as Watched?`,
              onConfirm: async () => {
                switch (item.type) {
                  case "movie":
                  case "episode":
                    item.viewCount = 1;
                    await setMediaPlayedStatus(true, item.ratingKey);
                    break;
                  case "show":
                    item.viewedLeafCount = item.leafCount;
                    await setMediaPlayedStatus(true, item.ratingKey);
                    break;
                  default:
                    break;
                }

                handleClose();
                refetchData?.();
              },
              onCancel: () => {
                handleClose();
              },
            });
          }}
        >
          <ListItemIcon>
            <CheckCircleRounded fontSize="small" />
          </ListItemIcon>
          Mark as Watched
        </MenuItem>
        <MenuItem
          onClick={async () => {
            if (!item) return;

            useConfirmModal.getState().setModal({
              title: `Mark as Unwatched`,
              message: `Are you sure you want to mark "${item.title}" as Unwatched?`,
              onConfirm: async () => {
                switch (item.type) {
                  case "movie":
                  case "episode":
                    item.viewCount = 0;
                    await setMediaPlayedStatus(false, item.ratingKey);
                    break;
                  case "show":
                    item.viewedLeafCount = 0;
                    await setMediaPlayedStatus(false, item.ratingKey);
                    break;
                  default:
                    break;
                }

                handleClose();
                refetchData?.();
              },
              onCancel: () => {
                handleClose();
              },
            });
          }}
        >
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
        onClick={(e) => {
          if (onClick) onClick(e);
        }}
        onContextMenu={handleContextMenu}
      >
        <Box
          sx={{
            minWidth: { xs: "30px", sm: "40px" },
            width: "auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            alignSelf: "center",
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
              214
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

          {(item.viewOffset || (item.viewCount && item.viewCount >= 1)) && (
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
              {getMinutes(item.duration)} Min.
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

/**
 * Calculates the number of minutes from a given duration in milliseconds.
 *
 * @param duration The duration in milliseconds.
 * @returns The number of minutes.
 */
export function getMinutes(duration: number): number {
  return Math.floor(duration / 60000);
}
