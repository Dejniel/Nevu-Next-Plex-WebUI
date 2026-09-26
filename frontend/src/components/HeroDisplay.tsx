import {
  PlayArrowRounded,
  InfoOutlined,
  VolumeOffRounded,
  VolumeUpRounded,
  PauseRounded,
} from "@mui/icons-material";
import { Box, Typography, Button, IconButton, Skeleton } from "@mui/material";
import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { usePreviewPlayer } from "../states/PreviewPlayerState";
import { useBigReader } from "./BigReader";
import { HeroWatchListButton } from "./MovieItem";
import { getTranscodeImageURL } from "../plex";
import ExtraPlayer from "./title/ExtraPlayer";
import { useTitleExtras } from "../hooks/useTitleExtras";

function HeroDisplay({
  item,
  onArtworkError,
}: {
  item: Plex.Metadata;
  onArtworkError?: () => void;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const { MetaScreenPlayerMuted, setMetaScreenPlayerMuted } =
    usePreviewPlayer();
  const { primaryTrailer } = useTitleExtras(item);

  const [previewVidPlaying, setPreviewVidPlaying] = useState<boolean>(false);
  const [artworkLoaded, setArtworkLoaded] = useState(false);
  const artworkUrl = getTranscodeImageURL(item.art, 1920, 1080);

  useEffect(() => {
    setArtworkLoaded(false);
  }, [item.art]);

  useEffect(() => {
    setPreviewVidPlaying(false);

    if (!primaryTrailer || searchParams.has("mid")) return;

    const timeout = setTimeout(() => {
      if (window.scrollY > 100) return;
      setPreviewVidPlaying(true);
    }, 3000);

    const onScroll = () => {
      if (window.scrollY > 100) setPreviewVidPlaying(false);
      else setPreviewVidPlaying(true);
    };

    window.addEventListener("scroll", onScroll);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener("scroll", onScroll);
    };
  }, [primaryTrailer, searchParams]);

  return (
    <Box
      sx={{
        width: "100%",
        height: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "flex-start",
      }}
    >
      <Box
        sx={{
          position: "absolute",
          right: "2vw",
          bottom: { xs: "20vh", sm: "15vh", md: "20vh" },
          opacity: primaryTrailer ? 1 : 0,
          transition: "all 1s ease",
          zIndex: 2,
          cursor: "pointer",
          pointerEvents: "all",

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
            setPreviewVidPlaying(!previewVidPlaying);
          }}
        >
          {previewVidPlaying ? <PauseRounded /> : <PlayArrowRounded />}
        </IconButton>

        <IconButton
          aria-label={MetaScreenPlayerMuted ? "Unmute trailer" : "Mute trailer"}
          sx={{
            backgroundColor: "#00000088",
          }}
          onClick={() => {
            setMetaScreenPlayerMuted(!MetaScreenPlayerMuted);
          }}
        >
          {MetaScreenPlayerMuted ? <VolumeOffRounded /> : <VolumeUpRounded />}
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
          backgroundColor: "#15171b",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.04)",
          zIndex: 0,
          position: "relative",
          overflow: "hidden",
          isolation: "isolate",
        }}
      >
        <Box
          component="img"
          src={artworkUrl}
          alt=""
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
            transition: "opacity 0.35s ease",
            zIndex: 0,
          }}
        />
        {!artworkLoaded && (
          <Skeleton
            variant="rectangular"
            animation="wave"
            sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 0 }}
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
            opacity: previewVidPlaying ? 1 : 0,
            transition: "all 2s ease",
            backgroundColor: previewVidPlaying ? "#000000" : "transparent",
            pointerEvents: "none",

            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {primaryTrailer && (
            <ExtraPlayer
              extra={primaryTrailer}
              autoPlay={previewVidPlaying}
              playing={previewVidPlaying}
              muted={MetaScreenPlayerMuted}
              volume={0.5}
              controls={false}
              objectFit="cover"
              showErrors={false}
              onEnded={() => setPreviewVidPlaying(false)}
              onPlaybackError={() => setPreviewVidPlaying(false)}
            />
          )}
        </Box>

        <Box
          sx={{
            ml: { xs: 2, sm: 5, md: 10 },
            mb: { xs: "30vh", sm: "25vh", md: "40vh" },
            zIndex: 2,
            mr: { xs: 2, sm: 4, md: 0 },
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
              maxWidth: { xs: "85vw", sm: "60vw", md: "35vw" },

              // make the text max 4 lines long and add ellipsis
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              textOverflow: "ellipsis",

              userSelect: "none",
              cursor: "zoom-in",
            }}
            onClick={() => {
              useBigReader.getState().setBigReader(item.summary);
            }}
          >
            {item.summary}
          </Typography>

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
              variant="contained"
              sx={{
                fontWeight: "bold",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                gap: "10px",
                transition: "all 0.2s ease-in-out",
              }}
              onClick={() => {
                if (!item) return;
                navigate(`/watch/${item.ratingKey}`);
              }}
            >
              <PlayArrowRounded fontSize="medium" /> Play
            </Button>

            <Button
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
              onClick={() => {
                if (!item) return;
                setPreviewVidPlaying(false);
                setSearchParams({
                  ...searchParams,
                  mid: item.ratingKey.toString(),
                });
              }}
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

            <HeroWatchListButton item={item} />
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

          backgroundImage:
            "linear-gradient(180deg, #00000000, #000000AA, #000000FF)",
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

export default HeroDisplay;
