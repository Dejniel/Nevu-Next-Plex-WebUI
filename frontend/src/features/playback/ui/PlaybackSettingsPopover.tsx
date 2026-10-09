import { overlayContainer } from "shared/lib/overlayContainer";
import { SearchRounded } from "@mui/icons-material";
import { alpha, Divider, Paper, Popover, useTheme } from "@mui/material";
import { useEffect, useState } from "react";
import { mediaVersionDetails } from "entities/media/model";
import { getPlaybackQualityOptions } from "../model/playbackPresentation";
import type { PlaybackMediaController } from "../model/usePlaybackMedia";
import SubtitleSearchPanel from "./SubtitleSearchPanel";
import {
  tuneSettingTab,
  TuneAction,
  TuneOption,
  TuneSectionLabel,
} from "./TuneControls";

type PlaybackSettingsMedia = Pick<
  PlaybackMediaController,
  | "metadata"
  | "activeVersion"
  | "mediaVersions"
  | "audioChoices"
  | "subtitleChoices"
  | "quality"
  | "selectQuality"
  | "selectMediaVersion"
  | "selectAudioTrack"
  | "selectSubtitleTrack"
  | "disableSubtitles"
  | "downloadOnDemandSubtitle"
>;

interface PlaybackSettingsPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  media: PlaybackSettingsMedia;
  onClose: () => void;
}

export default function PlaybackSettingsPopover({
  open,
  anchorEl,
  media,
  onClose,
}: PlaybackSettingsPopoverProps) {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const {
    metadata,
    activeVersion,
    mediaVersions,
    audioChoices,
    subtitleChoices,
    quality,
    selectQuality,
    selectMediaVersion,
    selectAudioTrack,
    selectSubtitleTrack,
    disableSubtitles,
    downloadOnDemandSubtitle,
  } = media;

  useEffect(() => {
    if (!open) setPage(0);
  }, [open]);

  return (
    <Popover
      container={overlayContainer}
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
      transformOrigin={{ vertical: "bottom", horizontal: "center" }}
      sx={{
        "& .MuiPaper-root": {
          overflow: "hidden",
          borderRadius: 1,
          background: "transparent",
        },
      }}
    >
      <Paper
        sx={{
          width: page === 4 ? { xs: "calc(100vw - 24px)", sm: 520 } : 350,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "min(70vh, 600px)",
          overflowY: "auto",
          userSelect: "none",
          backdropFilter: "blur(20px)",
          border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
        }}
      >
        {page === 0 && (
          <>
            {tuneSettingTab(setPage, { pageNum: 1, text: "Video" })}
            {tuneSettingTab(setPage, { pageNum: 2, text: "Audio" })}
            {tuneSettingTab(setPage, { pageNum: 3, text: "Subtitles" })}
          </>
        )}

        {page === 1 && activeVersion && (
          <>
            {tuneSettingTab(setPage, { pageNum: 0, text: "Back" })}
            {mediaVersions.length > 1 && (
              <>
                <TuneSectionLabel>Source</TuneSectionLabel>
                {mediaVersions.map((version) => (
                  <TuneOption
                    key={version.media.id || version.mediaIndex}
                    selected={
                      version.mediaIndex === activeVersion.mediaIndex &&
                      version.partIndex === activeVersion.partIndex
                    }
                    primary={`Version ${version.mediaIndex + 1}`}
                    secondary={mediaVersionDetails(version)}
                    onClick={() => {
                      setPage(0);
                      void selectMediaVersion(version);
                    }}
                  />
                ))}
                <Divider />
              </>
            )}
            <TuneSectionLabel>Streaming quality</TuneSectionLabel>
            {getPlaybackQualityOptions(
              activeVersion.media.videoResolution ?? "",
              activeVersion.media.bitrate
                ? `${Math.floor(activeVersion.media.bitrate / 1000)}Mbps`
                : "Unknown bitrate",
            ).map((qualityOption) => (
              <TuneOption
                key={`${qualityOption.title}:${qualityOption.bitrate}`}
                selected={
                  qualityOption.original
                    ? quality.bitrate === undefined || quality.bitrate < 0
                    : qualityOption.bitrate === quality.bitrate
                }
                primary={qualityOption.title}
                secondary={qualityOption.extra}
                onClick={() => {
                  setPage(0);
                  void selectQuality({
                    bitrate: qualityOption.bitrate,
                  });
                }}
              />
            ))}
          </>
        )}

        {page === 2 && activeVersion && (
          <>
            {tuneSettingTab(setPage, { pageNum: 0, text: "Back" })}
            {audioChoices.map((choice) => (
              <TuneOption
                disabled={!choice.part.id || !choice.stream.id}
                key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                selected={
                  choice.mediaIndex === activeVersion.mediaIndex &&
                  choice.partIndex === activeVersion.partIndex &&
                  Boolean(choice.stream.selected)
                }
                primary={
                  choice.stream.extendedDisplayTitle ||
                  choice.stream.displayTitle ||
                  `Audio ${(choice.stream.index ?? 0) + 1}`
                }
                secondary={
                  mediaVersions.length > 1
                    ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                    : undefined
                }
                onClick={() => {
                  setPage(0);
                  void selectAudioTrack(choice);
                }}
              />
            ))}
          </>
        )}

        {page === 3 && activeVersion && (
          <>
            {tuneSettingTab(setPage, { pageNum: 0, text: "Back" })}
            <TuneOption
              disabled={!activeVersion.part.id}
              selected={
                !activeVersion.part.Stream?.some(
                  (stream) => stream.streamType === 3 && stream.selected,
                )
              }
              primary="None"
              onClick={() => {
                setPage(0);
                void disableSubtitles();
              }}
            />
            {subtitleChoices.map((choice) => (
              <TuneOption
                disabled={!choice.part.id || !choice.stream.id}
                key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                selected={
                  choice.mediaIndex === activeVersion.mediaIndex &&
                  choice.partIndex === activeVersion.partIndex &&
                  Boolean(choice.stream.selected)
                }
                primary={
                  choice.stream.extendedDisplayTitle ||
                  choice.stream.displayTitle ||
                  `Subtitle ${(choice.stream.index ?? 0) + 1}`
                }
                secondary={
                  mediaVersions.length > 1
                    ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                    : undefined
                }
                onClick={() => {
                  setPage(0);
                  void selectSubtitleTrack(choice);
                }}
              />
            ))}
            <Divider />
            <TuneAction
              disabled={!activeVersion.media.id}
              icon={<SearchRounded fontSize="small" />}
              primary="Find subtitles…"
              secondary="Search Plex subtitle providers"
              onClick={() => setPage(4)}
            />
          </>
        )}

        {page === 4 && activeVersion && metadata && (
          <>
            {tuneSettingTab(setPage, {
              pageNum: 3,
              text: "Find subtitles",
            })}
            <SubtitleSearchPanel
              key={`${metadata.ratingKey}:${activeVersion.media.id}:${activeVersion.part.id}`}
              metadata={metadata}
              version={activeVersion}
              onDownload={async (subtitle) => {
                await downloadOnDemandSubtitle(subtitle);
                setPage(3);
              }}
            />
          </>
        )}
      </Paper>
    </Popover>
  );
}
