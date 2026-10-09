import {
  PlayArrowRounded,
  InfoOutlined,
  VolumeOffRounded,
  VolumeUpRounded,
  PauseRounded,
} from "@mui/icons-material";
import { Box, Typography, Button, IconButton, Skeleton } from "@mui/material";
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { usePreviewAudio } from "entities/media/public";
import { HeroWatchlistButton } from "features/watchlist/public";
import {
  getResponsiveTranscodeImageProps,
  HERO_IMAGE_WIDTHS,
} from "entities/media/model";
import { useTitleExtras } from "features/title-details/public";
import { MediaExtraPlayback } from "entities/media/public";
import { alpha } from "@mui/material/styles";
import { HOME_CONTENT_GUTTER, homeHeroContentSx } from "./homeHeroLayout";
import { mediaDetailsTo, mediaWatchTo } from "shared/lib/navigation";

function HomeHero({
  item,
  onArtworkError,
}: {
  item: Plex.Metadata;
  onArtworkError?: () => void;
}) {
  const [searchParams] = useSearchParams();
  const location = useLocation();

  const { muted, setMuted } = usePreviewAudio();
  const { primaryTrailer } = useTitleExtras(item);

  const [previewVidPlaying, setPreviewVidPlaying] = useState<boolean>(false);
  const [previewVidVisible, setPreviewVidVisible] = useState<boolean>(false);
  const [artworkLoaded, setArtworkLoaded] = useState(false);
  const artwork = getResponsiveTranscodeImageProps(item.art, {
    widths: HERO_IMAGE_WIDTHS,
    aspectRatio: 16 / 9,
    sizes: "100vw",
    fallbackWidth: 1280,
  });

  useEffect(() => {
    setArtworkLoaded(false);
  }, [item.art]);

  useEffect(() => {
    setPreviewVidPlaying(false);
    setPreviewVidVisible(false);

    if (!primaryTrailer || searchParams.has("mid")) return;

    const timeout = setTimeout(() => {
      if (window.scrollY > 100) return;
      setPreviewVidPlaying(true);
    }, 3000);

    const onScroll = () => {
      if (window.scrollY > 100) {
        setPreviewVidPlaying(false);
        setPreviewVidVisible(false);
      } else setPreviewVidPlaying(true);
    };

    window.addEventListener("scroll", onScroll);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", onScroll);
    };
  }, [primaryTrailer, searchParams]);

  const detailsTarget = mediaDetailsTo(location, item);
  const stopPreview = () => {
    setPreviewVidPlaying(false);
    setPreviewVidVisible(false);
  };

  return (
    <Box
      sx={{
        width: "100%",
        height: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        position: "relative",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          left: HOME_CONTENT_GUTTER,
          bottom: "calc(20vh + 12px)",
          opacity: primaryTrailer ? 1 : 0,
          transition: "opacity 0.3s ease",
          zIndex: 2,
          cursor: "pointer",
          pointerEvents: primaryTrailer ? "auto" : "none",

          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        <IconButton
          aria-label={previewVidPlaying ? "Pause trailer" : "Play trailer"}
          sx={{
            backgroundColor: "#00000088",
          }}
          onClick={() => {
            const nextPlaying = !previewVidPlaying;
            setPreviewVidPlaying(nextPlaying);
            if (!nextPlaying) setPreviewVidVisible(false);
          }}
        >
          {previewVidPlaying ? <PauseRounded /> : <PlayArrowRounded />}
        </IconButton>

        <IconButton
          aria-label={muted ? "Unmute trailer" : "Mute trailer"}
          sx={{
            backgroundColor: "#00000088",
          }}
          onClick={() => {
            setMuted(!muted);
          }}
        >
          {muted ? <VolumeOffRounded /> : <VolumeUpRounded />}
        </IconButton>
      </Box>

      <Box
        sx={{
          width: "100%",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          backgroundColor: "background.default",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          zIndex: 0,
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <Box
          component="img"
          {...artwork}
          alt=""
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onLoad={() => setArtworkLoaded(true)}
          onError={onArtworkError}
          sx={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "center",
            opacity: artworkLoaded ? 1 : 0,
            transition: "opacity 0.15s ease",
            zIndex: 0,
          }}
        />
        {!artworkLoaded && (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              zIndex: 0,
            }}
          />
        )}
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.67)",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <Box
          sx={{
            position: "absolute",
            // make it take up the full width of the parent
            width: "100%",
            height: "100vh",
            left: 0,
            top: 0,
            filter: "brightness(0.5)",
            opacity: previewVidVisible ? 1 : 0,
            transition: "opacity 1s ease",
            backgroundColor: previewVidVisible ? "#000000" : "transparent",
            pointerEvents: "none",

            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {primaryTrailer && (
            <MediaExtraPlayback
              extra={primaryTrailer}
              autoPlay={previewVidPlaying}
              playing={previewVidPlaying}
              muted={muted}
              volume={0.5}
              controls={false}
              objectFit="cover"
              showErrors={false}
              onPlaying={() => {
                if (previewVidPlaying) setPreviewVidVisible(true);
              }}
              onPlayRejected={() => {
                setPreviewVidPlaying(false);
                setPreviewVidVisible(false);
              }}
              onEnded={() => {
                setPreviewVidPlaying(false);
                setPreviewVidVisible(false);
              }}
              onPlaybackError={() => {
                setPreviewVidPlaying(false);
                setPreviewVidVisible(false);
              }}
            />
          )}
        </Box>

        <Box
          sx={{
            ...homeHeroContentSx,
            zIndex: 2,
          }}
        >
          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "flex-start",
              mb: 0,
            }}
          >
            {/* <img
              src="/plexIcon.png"
              alt=""
              height="35"
              style={{
                aspectRatio: 1,
                borderRadius: 8,
              }}
            /> */}
            <Typography
              sx={{
                fontSize: { xs: "16px", md: "24px" },
                fontWeight: "900",
                letterSpacing: "0.1em",
                color: (theme) => theme.palette.primary.main,
                textTransform: "uppercase",
              }}
            >
              {item.type}
            </Typography>
          </Box>
          <Box
            component={Link}
            to={detailsTarget}
            aria-label={`Open details for ${item.title}`}
            onClick={stopPreview}
            sx={{
              display: "block",
              maxWidth: { xs: "85vw", sm: "60vw", md: "35vw" },
              m: 0,
              p: 0,
              border: 0,
              color: "inherit",
              background: "none",
              textAlign: "left",
              textDecoration: "none",
              cursor: "pointer",
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "primary.main",
                outlineOffset: 4,
              },
            }}
          >
            <Typography
              sx={{
                fontSize: { xs: "1.8rem", sm: "2.5rem", md: "3rem" },
                fontWeight: "bold",
              }}
            >
              {item.title}
            </Typography>
            <Typography
              sx={{
                fontSize: "medium",
                fontWeight: "light",
                display: "-webkit-box",
                WebkitLineClamp: 4,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {item.summary}
            </Typography>
          </Box>

          <Box
            sx={{
              display: "flex",
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "flex-start",
              mt: { xs: 2.5, sm: 4 },
              gap: { xs: 1.5, sm: 2 },
              ml: 0,
              minHeight: "36.5px",
            }}
          >
            <Button
              component={Link}
              to={mediaWatchTo(item)}
              variant="contained"
              sx={{
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                gap: "10px",
                transition: "all 0.2s ease-in-out",
              }}
            >
              <PlayArrowRounded fontSize="medium" /> Play
            </Button>

            <Button
              component={Link}
              to={detailsTarget}
              variant="contained"
              sx={{
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                "&:hover": {
                  "& > *:nth-child(2)": {
                    width: "91px",
                    ml: "10px",
                  },
                },
                transition: "all 0.2s ease-in-out",
              }}
              onClick={stopPreview}
            >
              <InfoOutlined fontSize="medium" />{" "}
              <Typography
                sx={{
                  width: "0px",
                  userSelect: "none",
                  display: "inline",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  transition: "all 0.2s ease-in-out",

                  fontSize: "0.875rem",
                  lineHeight: "1.75",
                }}
              >
                More Info
              </Typography>
            </Button>

            <HeroWatchlistButton item={item} />
          </Box>
        </Box>
      </Box>
      <Box
        sx={{
          width: "100%",
          height: { xs: "50vh", sm: "45vh", md: "40vh" },
          position: "absolute",
          bottom: 0,
          left: 0,

          backgroundImage: (theme) =>
            `linear-gradient(180deg, ${alpha(
              theme.palette.background.default,
              0,
            )}, ${alpha(theme.palette.background.default, 0.67)}, ${
              theme.palette.background.default
            })`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          backgroundColor: "transparent",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
    </Box>
  );
}

export default HomeHero;
