import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type Shaka from "shaka-player";
import {
  inspectNativeVideoError,
  shakaVideoError,
} from "shared/lib/video/errors";
import {
  createStreamingPlayer,
  streamingMimeType,
} from "shared/lib/video/shaka";
import type {
  VideoPlaybackError,
  VideoPlaybackFailure,
  VideoPlayerHandle,
  VideoProgress,
  VideoSource,
  VideoTextTrack,
} from "shared/lib/video/types";

export interface VideoPlayerProps {
  source: VideoSource | null;
  playing?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
  volume?: number;
  controls?: boolean;
  poster?: string;
  startTime?: number | null;
  objectFit?: React.CSSProperties["objectFit"];
  onReady?: (sourceId: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onPlaying?: () => void;
  onEnded?: () => void;
  onBuffering?: (buffering: boolean) => void;
  onProgress?: (progress: VideoProgress) => void;
  onError?: (error: VideoPlaybackFailure) => void;
  onPlayRejected?: () => void;
  onClick?: React.MouseEventHandler<HTMLVideoElement>;
}

const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(
  function VideoPlayer(props, ref) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const callbacks = useRef(props);
    callbacks.current = props;
    const ready = useRef(false);
    const lastPosition = useRef<number | undefined>(undefined);
    const disposing = useRef<Promise<unknown>>(Promise.resolve());
    const [loadedTracks, setLoadedTracks] = useState<{
      source: VideoSource;
      tracks: VideoTextTrack[];
    } | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        getCurrentTime: () => videoRef.current?.currentTime || 0,
        getDuration: () => {
          if (!ready.current) return 0;
          const duration = videoRef.current?.duration;
          return duration && Number.isFinite(duration) ? duration : 0;
        },
        seekTo: (seconds) => {
          const video = videoRef.current;
          if (video && Number.isFinite(seconds))
            video.currentTime = Math.max(0, seconds);
        },
      }),
      [],
    );

    const playIfRequested = () => {
      const video = videoRef.current;
      const current = callbacks.current;
      if (!video || !ready.current || !(current.playing ?? current.autoPlay))
        return;
      void video.play().catch((error: DOMException) => {
        if (error.name === "NotAllowedError")
          callbacks.current.onPlayRejected?.();
      });
    };

    useEffect(() => {
      const video = videoRef.current;
      const source = props.source;
      const startTime = props.startTime;
      if (!video || !source) return;
      let cancelled = false;
      let player: Shaka.Player | null = null;
      let failed = false;
      let loaded = false;
      let initialized = false;
      const controller = new AbortController();
      ready.current = false;
      lastPosition.current = undefined;

      const position = () =>
        ready.current && Number.isFinite(video.duration) && video.duration > 0
          ? video.currentTime
          : lastPosition.current;
      const fail = (
        error: VideoPlaybackError | null,
        resumeAt = position(),
      ) => {
        if (cancelled || failed || !error) return;
        failed = true;
        console.warn("Video playback failed:", error.kind, error.code);
        callbacks.current.onBuffering?.(false);
        callbacks.current.onError?.({
          ...error,
          sourceId: source.id,
          position: resumeAt,
        });
      };
      const markReady = () => {
        if (
          cancelled ||
          ready.current ||
          failed ||
          !loaded ||
          video.readyState < 1
        )
          return;
        ready.current = true;
        if (
          source.type === "file" &&
          startTime != null &&
          Number.isFinite(startTime)
        )
          video.currentTime = Math.max(0, startTime);
        callbacks.current.onReady?.(source.id);
        lastPosition.current = video.currentTime;
        playIfRequested();
        if (source.loadTextTracks)
          void source
            .loadTextTracks(controller.signal)
            .then((result) => {
              if (cancelled || failed) return;
              if ("error" in result) fail(result.error);
              else setLoadedTracks({ source, tracks: result.tracks });
            })
            .catch(() =>
              fail({
                kind: "subtitle",
                message: "The selected subtitles could not be loaded.",
              }),
            );
      };
      const nativeError = () => {
        if (initialized && video.error) {
          const resumeAt = position();
          void inspectNativeVideoError(
            video.error,
            source.url,
            controller.signal,
          ).then((error) => fail(error, resumeAt));
        }
      };
      const streamError = (event: Event) =>
        fail(shakaVideoError((event as CustomEvent).detail));
      video.addEventListener("loadedmetadata", markReady);
      video.addEventListener("error", nativeError);

      void disposing.current
        .then(async () => {
          if (cancelled) return;
          initialized = true;
          callbacks.current.onBuffering?.(true);
          if (source.type === "file") {
            loaded = true;
            video.src = source.url;
            video.load();
          } else {
            const engine = await createStreamingPlayer(video);
            if (cancelled) {
              await engine.destroy();
              return;
            }
            player = engine;
            engine.addEventListener("error", streamError);
            await engine.attach(video);
            if (cancelled) return;
            await engine.load(
              new URL(source.url, window.location.href).href,
              startTime ?? null,
              streamingMimeType(source),
            );
            loaded = true;
            markReady();
          }
        })
        .catch((error) => {
          if (!cancelled && error instanceof Error)
            console.warn(
              "Streaming initialization failed:",
              error.message.replace(/https?:\/\/\S+/g, "stream"),
            );
          fail(shakaVideoError(error));
        });

      return () => {
        cancelled = true;
        controller.abort();
        ready.current = false;
        video.removeEventListener("loadedmetadata", markReady);
        video.removeEventListener("error", nativeError);
        video.pause();
        if (player) {
          player.removeEventListener("error", streamError);
          disposing.current = player.destroy().catch(() => undefined);
        } else {
          video.removeAttribute("src");
          video.load();
        }
      };
      // Source identity owns the engine; event callbacks remain current via the ref.
      // oxlint-disable-next-line react/exhaustive-deps
    }, [props.source]);

    useEffect(() => {
      if (props.playing ?? props.autoPlay) playIfRequested();
      else videoRef.current?.pause();
      // oxlint-disable-next-line react/exhaustive-deps
    }, [props.playing, props.autoPlay]);

    useEffect(() => {
      const video = videoRef.current;
      if (video) video.volume = Math.min(1, Math.max(0, props.volume ?? 1));
    }, [props.volume]);

    const progress = () => {
      const video = videoRef.current;
      if (!video || !ready.current) return;
      lastPosition.current = video.currentTime;
      let loadedSeconds = video.currentTime;
      for (let index = 0; index < video.buffered.length; index++) {
        if (video.buffered.start(index) <= video.currentTime + 0.1)
          loadedSeconds = Math.max(loadedSeconds, video.buffered.end(index));
      }
      callbacks.current.onProgress?.({
        playedSeconds: video.currentTime,
        loadedSeconds,
      });
    };

    return (
      <video
        ref={videoRef}
        playsInline
        muted={props.muted}
        controls={props.controls}
        poster={props.poster}
        preload="metadata"
        controlsList="nodownload"
        disablePictureInPicture
        onClick={props.onClick}
        onPlay={() => callbacks.current.onPlay?.()}
        onPause={() => {
          if (ready.current) callbacks.current.onPause?.();
        }}
        onPlaying={() => {
          callbacks.current.onBuffering?.(false);
          callbacks.current.onPlaying?.();
        }}
        onCanPlay={() => {
          callbacks.current.onBuffering?.(false);
          playIfRequested();
        }}
        onWaiting={() => callbacks.current.onBuffering?.(true)}
        onEnded={() => callbacks.current.onEnded?.()}
        onTimeUpdate={progress}
        onProgress={progress}
        onSeeked={progress}
        style={{
          display: "block",
          width: "100%",
          height: "100%",
          objectFit: props.objectFit ?? "contain",
          background: "#000",
        }}
      >
        {(loadedTracks?.source === props.source
          ? loadedTracks.tracks
          : props.source?.textTracks
        )?.map((track) => (
          <track
            key={track.url}
            src={track.url}
            kind="subtitles"
            srcLang={track.language}
            label={track.label}
            default
            ref={(element) => {
              if (!element) return;
              const onError = () =>
                callbacks.current.onError?.({
                  sourceId: props.source!.id,
                  kind: "subtitle",
                  message: "The selected subtitles could not be loaded.",
                  position: lastPosition.current,
                });
              element.addEventListener("error", onError);
              return () => element.removeEventListener("error", onError);
            }}
          />
        ))}
      </video>
    );
  },
);

export default VideoPlayer;
