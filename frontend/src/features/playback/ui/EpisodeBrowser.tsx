import { overlayContainer } from "shared/lib/overlayContainer";
import {
  ArrowBackIosNewRounded,
  PlayArrowRounded,
  SubscriptionsRounded,
} from "@mui/icons-material";
import {
  Backdrop,
  Box,
  Divider,
  Fade,
  IconButton,
  LinearProgress,
  Paper,
  Popper,
  Portal,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import React, { useEffect } from "react";
import { useState } from "react";
import { getTranscodeImageURL, mediaChildrenQueryOptions } from "entities/media/model";
import { useQuery } from "@tanstack/react-query";
import { useActiveServerScope } from "features/session/model";
import { serverQueryClient } from "shared/api/queryClient";
import { durationInMinutes } from "shared/lib/duration";
import { Link } from "react-router-dom";
import { mediaWatchTo } from "shared/lib/navigation";

function EpisodeBrowser({
  item,
  controlElementsVisibleState,
}: {
  item: Plex.Metadata;
  controlElementsVisibleState: [boolean, React.Dispatch<React.SetStateAction<boolean>>];
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const scope = useActiveServerScope();
  const [selectedSeason, setSelectedSeason] = useState(item.parentIndex ?? 1);
  const showID = item.grandparentRatingKey ?? "";
  const seasonsResult = useQuery(
    {
      ...mediaChildrenQueryOptions(scope, showID),
      enabled: Boolean(anchorEl && showID && scope.serverId && scope.profileKey),
    },
    serverQueryClient,
  );
  const seasons = seasonsResult.data;
  const seasonID = seasons?.find((season) => season.index === selectedSeason)?.ratingKey ?? "";
  const episodesResult = useQuery(
    {
      ...mediaChildrenQueryOptions(scope, seasonID),
      enabled: Boolean(anchorEl && seasonID && scope.serverId && scope.profileKey),
    },
    serverQueryClient,
  );
  const episodes = episodesResult.data;
  const theme = useTheme();

  const [, setControlElementsVisible] = controlElementsVisibleState;

  useEffect(() => {
    setSelectedSeason(item.parentIndex ?? 1);
  }, [item.ratingKey, item.parentIndex]);

  useEffect(() => {
    setControlElementsVisible(Boolean(anchorEl));
  }, [anchorEl, setControlElementsVisible]);

  return (
    <>
      <Portal container={overlayContainer}>
        <Backdrop
          open={Boolean(anchorEl)}
          sx={{
            zIndex: 9999,
            backgroundColor: "transparent",
          }}
          onClick={(e) => {
            e.stopPropagation();
            setAnchorEl(null);
          }}
        >
          <Popper
            container={overlayContainer}
            open={Boolean(anchorEl)}
            anchorEl={anchorEl}
            placement="bottom"
            sx={{
              zIndex: 10000,
              "& .MuiPaper-root": {
                overflow: "hidden",
                borderRadius: 1,
                background: "transparent",
              },
            }}
            transition
            modifiers={[
              {
                name: "offset",
                options: {
                  offset: [0, 8],
                },
              },
              {
                name: "preventOverflow",
                enabled: true,
                options: {
                  altAxis: false,
                  altBoundary: false,
                  tether: false,
                  rootBoundary: "viewport",
                  padding: 16,
                },
              },
            ]}
            onClick={(e) => e.stopPropagation()}
          >
            {({ TransitionProps }) => (
              <Fade {...TransitionProps} timeout={300}>
                <Paper
                  sx={{
                    overflow: "hidden",
                    bgcolor: "#000",
                    border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                    userSelect: "none",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      borderRadius: 1,
                      maxHeight: "70vh",
                      maxWidth: "90vw",
                      backgroundColor: "#00000088",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Season selector */}
                    {(seasons?.length ?? 1) > 1 && (
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          width: 220,
                          height: 480,
                          overflow: "auto",
                          borderRight: `1px solid ${theme.palette.divider}`,
                        }}
                      >
                        <Box sx={{ p: 2, pb: 1 }}>
                          <Typography variant="subtitle1" noWrap sx={{ fontWeight: "medium" }}>
                            {item.grandparentTitle}
                          </Typography>
                        </Box>

                        <Divider />

                        {seasons?.map((season) => (
                          <Box
                            key={season.ratingKey}
                            onClick={() => setSelectedSeason(season.index ?? 1)}
                            sx={{
                              py: 1.5,
                              px: 2,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              cursor: "pointer",
                              transition: "all 0.2s",
                              bgcolor:
                                selectedSeason === season.index
                                  ? alpha(theme.palette.primary.main, 0.15)
                                  : "transparent",
                              "&:hover": {
                                bgcolor:
                                  selectedSeason === season.index
                                    ? alpha(theme.palette.primary.main, 0.2)
                                    : alpha(theme.palette.action.hover, 0.1),
                              },
                            }}
                          >
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: selectedSeason === season.index ? "medium" : "normal",
                              }}
                            >
                              {season.title}
                            </Typography>

                            {selectedSeason !== season.index && (
                              <ArrowBackIosNewRounded
                                sx={{
                                  fontSize: 14,
                                  transform: "rotate(180deg)",
                                  color: "text.secondary",
                                }}
                              />
                            )}
                          </Box>
                        ))}
                      </Box>
                    )}

                    {/* Episodes list */}
                    <Box
                      sx={{
                        display: "flex",
                        flexDirection: "column",
                        width: 600,
                        height: 480,
                        overflowY: "auto",
                        p: 2,
                      }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                        }}
                      >
                        {episodes
                          ?.filter((episode) => episode.parentIndex === selectedSeason)
                          .map((episode) => (
                            <Box
                              key={episode.ratingKey}
                              component={episode.ratingKey !== item.ratingKey ? Link : "div"}
                              to={
                                episode.ratingKey !== item.ratingKey
                                  ? mediaWatchTo(episode)
                                  : undefined
                              }
                              onClick={() => {
                                if (episode.ratingKey !== item.ratingKey) setAnchorEl(null);
                              }}
                              sx={{
                                display: "flex",
                                color: "inherit",
                                textDecoration: "none",
                                borderRadius: 1,
                                overflow: "hidden",
                                transition: "all 0.2s",
                                ...(episode.ratingKey !== item.ratingKey && {
                                  cursor: "pointer",
                                  "&:hover": {
                                    bgcolor: alpha(theme.palette.action.hover, 0.1),
                                    "& .playIcon": {
                                      opacity: 1,
                                    },
                                  },
                                }),
                              }}
                            >
                              {/* Episode thumbnail */}
                              <Box
                                sx={{
                                  position: "relative",
                                  width: 160,
                                  aspectRatio: "16/9",
                                  flexShrink: 0,
                                  borderRadius: 1,
                                  overflow: "hidden",
                                }}
                              >
                                <Box
                                  sx={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    backgroundImage: `url(${getTranscodeImageURL(
                                      episode.thumb,
                                      320,
                                      180,
                                    )})`,
                                    backgroundSize: "cover",
                                    backgroundPosition: "center",
                                  }}
                                />

                                <PlayArrowRounded
                                  className="playIcon"
                                  sx={{
                                    position: "absolute",
                                    top: "50%",
                                    left: "50%",
                                    transform: "translate(-50%, -50%)",
                                    fontSize: 48,
                                    color: "white",
                                    opacity: 0,
                                    transition: "opacity 0.2s",
                                    backgroundColor: alpha("#000", 0.5),
                                    borderRadius: "50%",
                                  }}
                                />

                                {(episode.viewOffset ||
                                  (episode.viewCount && episode.viewCount >= 1)) && (
                                  <LinearProgress
                                    value={
                                      episode.viewOffset
                                        ? (episode.viewOffset / episode.duration) * 100
                                        : 100
                                    }
                                    variant="determinate"
                                    sx={{
                                      position: "absolute",
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      height: 3,
                                      bgcolor: alpha("#000", 0.5),
                                    }}
                                  />
                                )}
                              </Box>

                              {/* Episode details */}
                              <Box sx={{ px: 2, py: 1, flex: 1 }}>
                                <Box
                                  sx={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    mb: 0.5,
                                  }}
                                >
                                  <Box
                                    sx={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 0.5,
                                    }}
                                  >
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                      {episode.index}
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                      •
                                    </Typography>
                                    <Typography
                                      variant="subtitle2"
                                      noWrap
                                      sx={{ fontWeight: "medium" }}
                                    >
                                      {episode.title}
                                    </Typography>
                                  </Box>

                                  <Typography
                                    variant="caption"
                                    sx={{ color: "text.secondary", whiteSpace: "nowrap" }}
                                  >
                                    {durationInMinutes(episode.duration)} min
                                  </Typography>
                                </Box>

                                <Typography
                                  variant="body2"
                                  sx={{
                                    color: "text.secondary",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical",
                                  }}
                                >
                                  {episode.summary}
                                </Typography>
                              </Box>
                            </Box>
                          ))}
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              </Fade>
            )}
          </Popper>
        </Backdrop>
      </Portal>
      <IconButton onClick={(event) => setAnchorEl(event.currentTarget)}>
        <SubscriptionsRounded fontSize="small" />
      </IconButton>
    </>
  );
}

export default EpisodeBrowser;
