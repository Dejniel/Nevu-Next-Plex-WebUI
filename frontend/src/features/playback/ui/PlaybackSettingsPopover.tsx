import { SearchRounded } from "@mui/icons-material";
import { alpha, Divider, Paper, Popover, useTheme } from "@mui/material";
import { useEffect, useState } from "react";
import {
  MediaVersion,
  mediaVersionDetails,
  TrackChoice,
} from "entities/media/model";
import { SubtitleSearchResult } from "../api/subtitles";
import { getPlaybackQualityOptions } from "../model/playbackPresentation";
import { PlaybackQuality } from "../model/playbackSource";
import SubtitleSearchPanel from "./SubtitleSearchPanel";
import {
  tuneSettingTab,
  TuneAction,
  TuneOption,
  TuneSectionLabel,
} from "./TuneControls";

interface PlaybackSettingsPopoverProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  metadata: Plex.Metadata | null;
  activeMediaIndex: number;
  activeVersion?: MediaVersion;
  mediaVersions: MediaVersion[];
  audioChoices: TrackChoice[];
  subtitleChoices: TrackChoice[];
  quality: PlaybackQuality;
  onClose: () => void;
  onSelectQuality: (quality: PlaybackQuality) => Promise<void>;
  onSelectMediaVersion: (version: MediaVersion) => Promise<void>;
  onSelectAudioTrack: (choice: TrackChoice) => Promise<void>;
  onSelectSubtitleTrack: (choice: TrackChoice) => Promise<unknown>;
  onDisableSubtitles: () => Promise<void>;
  onDownloadSubtitle: (subtitle: SubtitleSearchResult) => Promise<void>;
}

export default function PlaybackSettingsPopover({
  open,
  anchorEl,
  metadata,
  activeMediaIndex,
  activeVersion,
  mediaVersions,
  audioChoices,
  subtitleChoices,
  quality,
  onClose,
  onSelectQuality,
  onSelectMediaVersion,
  onSelectAudioTrack,
  onSelectSubtitleTrack,
  onDisableSubtitles,
  onDownloadSubtitle,
}: PlaybackSettingsPopoverProps) {
  const theme = useTheme();
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!open) setPage(0);
  }, [open]);

  return (
    <Popover
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
                    selected={version.mediaIndex === activeMediaIndex}
                    primary={`Version ${version.mediaIndex + 1}`}
                    secondary={mediaVersionDetails(version)}
                    onClick={() => {
                      setPage(0);
                      void onSelectMediaVersion(version);
                    }}
                  />
                ))}
                <Divider />
              </>
            )}
            <TuneSectionLabel>Streaming quality</TuneSectionLabel>
            {getPlaybackQualityOptions(
              activeVersion.media.videoResolution,
              `${Math.floor(activeVersion.media.bitrate / 1000)}Mbps`,
            ).map((qualityOption) => (
              <TuneOption
                key={`${qualityOption.title}:${qualityOption.bitrate}`}
                selected={qualityOption.bitrate === quality.bitrate}
                primary={qualityOption.title}
                secondary={qualityOption.extra}
                onClick={() => {
                  setPage(0);
                  void onSelectQuality({
                    bitrate: qualityOption.original
                      ? undefined
                      : qualityOption.bitrate,
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
                key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                selected={
                  choice.mediaIndex === activeMediaIndex &&
                  Boolean(choice.stream.selected)
                }
                primary={
                  choice.stream.extendedDisplayTitle ||
                  choice.stream.displayTitle ||
                  `Audio ${choice.stream.index + 1}`
                }
                secondary={
                  mediaVersions.length > 1
                    ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                    : undefined
                }
                onClick={() => {
                  setPage(0);
                  void onSelectAudioTrack(choice);
                }}
              />
            ))}
          </>
        )}

        {page === 3 && activeVersion && (
          <>
            {tuneSettingTab(setPage, { pageNum: 0, text: "Back" })}
            <TuneOption
              selected={
                !activeVersion.part.Stream?.some(
                  (stream) => stream.streamType === 3 && stream.selected,
                )
              }
              primary="None"
              onClick={() => {
                setPage(0);
                void onDisableSubtitles();
              }}
            />
            {subtitleChoices.map((choice) => (
              <TuneOption
                key={`${choice.mediaIndex}:${choice.part.id}:${choice.stream.id}`}
                selected={
                  choice.mediaIndex === activeMediaIndex &&
                  Boolean(choice.stream.selected)
                }
                primary={
                  choice.stream.extendedDisplayTitle ||
                  choice.stream.displayTitle ||
                  `Subtitle ${choice.stream.index + 1}`
                }
                secondary={
                  mediaVersions.length > 1
                    ? `Version ${choice.mediaIndex + 1} · ${mediaVersionDetails(choice)}`
                    : undefined
                }
                onClick={() => {
                  setPage(0);
                  void onSelectSubtitleTrack(choice);
                }}
              />
            ))}
            <Divider />
            <TuneAction
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
                await onDownloadSubtitle(subtitle);
                setPage(3);
              }}
            />
          </>
        )}
      </Paper>
    </Popover>
  );
}
