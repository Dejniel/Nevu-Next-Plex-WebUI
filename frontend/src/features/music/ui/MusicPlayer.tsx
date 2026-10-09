import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Drawer,
  IconButton,
  Slider,
  Snackbar,
  Stack,
  Typography,
} from "@mui/material";
import {
  ArrowDownwardRounded,
  ArrowUpwardRounded,
  CloseRounded,
  PauseRounded,
  PlayArrowRounded,
  QueueMusicRounded,
  RepeatRounded,
  RepeatOneRounded,
  ShuffleRounded,
  SkipNextRounded,
  SkipPreviousRounded,
  VolumeUpRounded,
} from "@mui/icons-material";
import { Link, useLocation } from "react-router-dom";
import { VideoPlayer } from "shared/ui";
import { catalogItemTo } from "shared/lib/navigation";
import { getTranscodeImageURL, mediaArtworkPath } from "entities/media/model";
import { useMusicPlayback } from "../model/useMusicPlayback";
import { useMusic } from "../model/MusicProvider";
import { MusicMenu } from "./MusicActions";
import { durationToClock } from "shared/lib/duration";

export function MusicPlayer() {
  const music = useMusic();
  const location = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const {
    player,
    source,
    position,
    seek: seekTo,
    startTime,
    onProgress,
    onEnded,
    onError,
  } = useMusicPlayback();
  const entry = music.session?.entryID;
  const track = music.track;
  const showControls = !location.pathname.startsWith("/watch/");
  const artwork = track && mediaArtworkPath(track, "square");
  const duration =
    player.current?.getDuration() || (track?.duration ?? 0) / 1000;
  const controls = (
    <Stack
      direction="row"
      spacing={1}
      sx={{ alignItems: "center", justifyContent: "center" }}
    >
      <IconButton
        aria-label="Shuffle music queue"
        aria-pressed={music.queue?.shuffled ?? false}
        color={music.queue?.shuffled ? "primary" : "default"}
        disabled={music.busy || !music.queue || music.queue.total < 2}
        onClick={() => void music.shuffle()}
      >
        <ShuffleRounded />
      </IconButton>
      <IconButton
        aria-label="Previous track"
        disabled={music.busy}
        onClick={() => (position > 3 ? seekTo(0) : void music.step(-1))}
      >
        <SkipPreviousRounded />
      </IconButton>
      <IconButton
        aria-label={music.session?.playing ? "Pause music" : "Play music"}
        disabled={!source || music.busy}
        onClick={music.toggle}
        sx={{
          bgcolor: "primary.main",
          color: "primary.contrastText",
          "&:hover": { bgcolor: "primary.dark" },
        }}
      >
        {music.session?.playing ? <PauseRounded /> : <PlayArrowRounded />}
      </IconButton>
      <IconButton
        aria-label="Next track"
        disabled={music.busy}
        onClick={() => void music.step(1)}
      >
        <SkipNextRounded />
      </IconButton>
      <IconButton
        aria-label={`Repeat music: ${music.repeat === "off" ? "off" : music.repeat === "all" ? "queue" : "one track"}`}
        aria-pressed={music.repeat !== "off"}
        color={music.repeat !== "off" ? "primary" : "default"}
        onClick={() =>
          music.setRepeat(
            music.repeat === "off"
              ? "all"
              : music.repeat === "all"
                ? "one"
                : "off",
          )
        }
      >
        {music.repeat === "one" ? <RepeatOneRounded /> : <RepeatRounded />}
      </IconButton>
    </Stack>
  );
  const seek = (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <Typography variant="caption">
        {durationToClock(position * 1000)}
      </Typography>
      <Slider
        aria-label="Music position"
        size="small"
        min={0}
        max={Math.max(1, duration)}
        value={Math.min(position, duration)}
        onChange={(_, value) => {
          const seconds = value as number;
          seekTo(seconds);
        }}
      />
      <Typography variant="caption">
        {durationToClock(duration * 1000)}
      </Typography>
    </Stack>
  );
  return (
    <>
      <Snackbar
        open={Boolean(music.error)}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert severity="error" onClose={() => music.setError(null)}>
          {music.error}
        </Alert>
      </Snackbar>
      {music.session && (
        <>
          <Box
            sx={{
              position: "absolute",
              width: 1,
              height: 1,
              overflow: "hidden",
            }}
            aria-hidden
          >
            <VideoPlayer
              ref={player}
              source={source}
              playing={music.session.playing}
              loop={
                music.repeat === "one" ||
                (music.repeat === "all" && music.queue?.total === 1)
              }
              volume={music.volume}
              startTime={startTime}
              onPlayRejected={music.pause}
              onProgress={onProgress}
              onEnded={onEnded}
              onError={onError}
            />
          </Box>
          {showControls && (
            <>
              <Box sx={{ height: { xs: 80, sm: 112 } }} />
              <Box
                component="section"
                aria-label="Music player"
                sx={{
                  position: "fixed",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  zIndex: (theme) => theme.zIndex.appBar + 1,
                  bgcolor: "background.paper",
                  borderTop: "1px solid",
                  borderColor: "divider",
                  px: { xs: 1, sm: 2 },
                  pb: "env(safe-area-inset-bottom)",
                  boxShadow: "0 -4px 24px rgba(0,0,0,.3)",
                }}
              >
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "minmax(0,1fr) auto auto",
                      sm: "minmax(0,1fr) minmax(240px,1fr) minmax(0,1fr)",
                    },
                    gap: 1,
                    alignItems: "center",
                    py: 1,
                  }}
                >
                  <Box
                    component="button"
                    onClick={() => setExpanded(true)}
                    sx={{
                      color: "inherit",
                      bgcolor: "transparent",
                      border: 0,
                      p: 0,
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                      textAlign: "left",
                      minWidth: 0,
                      cursor: "pointer",
                    }}
                    aria-label="Open music player"
                  >
                    {artwork && (
                      <Box
                        component="img"
                        alt=""
                        src={getTranscodeImageURL(artwork, 96, 96)}
                        sx={{ width: 48, height: 48, borderRadius: 1 }}
                      />
                    )}
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontWeight: 600 }}>
                        {track?.title || "Loading track…"}
                      </Typography>
                      <Typography noWrap variant="body2" color="text.secondary">
                        {track?.grandparentTitle}
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: { xs: "none", sm: "block" } }}>
                    {controls}
                  </Box>
                  <Stack
                    direction="row"
                    sx={{ alignItems: "center", justifyContent: "flex-end" }}
                  >
                    <IconButton
                      aria-label={
                        music.session.playing ? "Pause music" : "Play music"
                      }
                      sx={{ display: { sm: "none" } }}
                      onClick={music.toggle}
                    >
                      {music.session.playing ? (
                        <PauseRounded />
                      ) : (
                        <PlayArrowRounded />
                      )}
                    </IconButton>
                    <VolumeUpRounded
                      sx={{ display: { xs: "none", md: "block" }, mr: 1 }}
                    />
                    <Slider
                      aria-label="Music volume"
                      size="small"
                      value={music.volume}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(_, value) => music.setVolume(value as number)}
                      sx={{ width: 90, display: { xs: "none", md: "block" } }}
                    />
                    <IconButton
                      aria-label="Open music queue"
                      onClick={() => setQueueOpen(true)}
                    >
                      <QueueMusicRounded />
                    </IconButton>
                    <IconButton
                      aria-label="Stop music"
                      onClick={music.stop}
                      sx={{ display: { xs: "none", sm: "inline-flex" } }}
                    >
                      <CloseRounded />
                    </IconButton>
                  </Stack>
                </Box>
                <Box
                  sx={{
                    display: { xs: "none", sm: "block" },
                    maxWidth: 700,
                    mx: "auto",
                  }}
                >
                  {seek}
                </Box>
              </Box>
              <Drawer
                anchor="bottom"
                open={expanded}
                onClose={() => setExpanded(false)}
                slotProps={{
                  paper: {
                    sx: {
                      maxHeight: "100dvh",
                      borderRadius: "16px 16px 0 0",
                      p: 2,
                      pb: "max(24px,env(safe-area-inset-bottom))",
                    },
                  },
                }}
              >
                <IconButton
                  aria-label="Close expanded player"
                  onClick={() => setExpanded(false)}
                  sx={{ alignSelf: "flex-end" }}
                >
                  <CloseRounded />
                </IconButton>
                <Stack
                  spacing={2}
                  sx={{ width: "100%", maxWidth: 460, mx: "auto" }}
                >
                  {artwork && (
                    <Box
                      component="img"
                      src={getTranscodeImageURL(artwork, 720, 720)}
                      alt=""
                      sx={{
                        width: "100%",
                        maxHeight: "45dvh",
                        objectFit: "contain",
                        borderRadius: 2,
                      }}
                    />
                  )}
                  <Stack direction="row" sx={{ alignItems: "center", gap: 1 }}>
                    <Typography
                      variant="h5"
                      sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}
                    >
                      {track?.title}
                    </Typography>
                    {track && <MusicMenu item={track} />}
                  </Stack>
                  {track && (
                    <Button
                      component={Link}
                      to={catalogItemTo(location, track)!}
                      onClick={() => setExpanded(false)}
                    >
                      {track.grandparentTitle} · {track.parentTitle}
                    </Button>
                  )}
                  {seek}
                  {controls}
                  <Slider
                    aria-label="Expanded music volume"
                    value={music.volume}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(_, value) => music.setVolume(value as number)}
                  />
                  <Button
                    onClick={() => {
                      setExpanded(false);
                      setQueueOpen(true);
                    }}
                  >
                    Queue
                  </Button>
                  <Button
                    onClick={() => {
                      setExpanded(false);
                      music.stop();
                    }}
                  >
                    Stop music
                  </Button>
                </Stack>
              </Drawer>
              <Drawer
                anchor="right"
                open={queueOpen}
                onClose={() => setQueueOpen(false)}
                slotProps={{
                  paper: { sx: { width: { xs: "100%", sm: 420 }, p: 2 } },
                }}
              >
                <Stack
                  direction="row"
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="h6">
                    Queue · {music.queue?.total ?? 0}
                  </Typography>
                  <IconButton
                    aria-label="Close queue"
                    onClick={() => setQueueOpen(false)}
                  >
                    <CloseRounded />
                  </IconButton>
                </Stack>
                <Stack
                  direction="row"
                  sx={{ justifyContent: "space-between", mb: 1 }}
                >
                  <Button
                    disabled={music.busy || !music.queue?.items.length}
                    onClick={() =>
                      void music.loadWindow(
                        music.queue!.items[0].playQueueItemID!,
                      )
                    }
                  >
                    Earlier
                  </Button>
                  <Button
                    disabled={music.busy || !entry}
                    onClick={() => void music.loadWindow(entry!)}
                  >
                    Current
                  </Button>
                  <Button
                    disabled={music.busy || !music.queue?.items.length}
                    onClick={() =>
                      void music.loadWindow(
                        music.queue!.items.at(-1)!.playQueueItemID!,
                      )
                    }
                  >
                    Later
                  </Button>
                </Stack>
                {music.queue?.items.map((item, index, items) => (
                  <Box
                    key={item.playQueueItemID}
                    sx={{
                      display: "flex",
                      gap: 0.5,
                      alignItems: "center",
                      py: 0.5,
                      bgcolor:
                        item.playQueueItemID === entry
                          ? "action.selected"
                          : undefined,
                    }}
                  >
                    <Button
                      sx={{
                        flex: 1,
                        minWidth: 0,
                        justifyContent: "flex-start",
                        textTransform: "none",
                        color: "text.primary",
                      }}
                      onClick={() => void music.select(item.playQueueItemID!)}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap>{item.title}</Typography>
                        <Typography
                          noWrap
                          variant="caption"
                          color="text.secondary"
                        >
                          {item.grandparentTitle}
                        </Typography>
                      </Box>
                    </Button>
                    <IconButton
                      size="small"
                      aria-label={`Move ${item.title} earlier`}
                      disabled={
                        music.busy ||
                        index === 0 ||
                        item.playQueueItemID === entry
                      }
                      onClick={() =>
                        void music.move(
                          item.playQueueItemID!,
                          items[index - 2]?.playQueueItemID,
                        )
                      }
                    >
                      <ArrowUpwardRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Move ${item.title} later`}
                      disabled={
                        music.busy ||
                        index === items.length - 1 ||
                        item.playQueueItemID === entry
                      }
                      onClick={() =>
                        void music.move(
                          item.playQueueItemID!,
                          items[index + 1].playQueueItemID,
                        )
                      }
                    >
                      <ArrowDownwardRounded fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      aria-label={`Remove ${item.title} from queue`}
                      disabled={music.busy || item.playQueueItemID === entry}
                      onClick={() => void music.remove(item.playQueueItemID!)}
                    >
                      <CloseRounded fontSize="small" />
                    </IconButton>
                  </Box>
                ))}
              </Drawer>
            </>
          )}
        </>
      )}
    </>
  );
}
