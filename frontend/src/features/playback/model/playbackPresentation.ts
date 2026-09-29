export interface PlaybackQualityOption {
  title: string;
  bitrate: number;
  extra: string;
  original?: boolean;
}

const qualityOptions: PlaybackQualityOption[] = [
  { title: "Convert to 4K", bitrate: 60000, extra: "(High) 60Mbps" },
  { title: "Convert to 4K", bitrate: 40000, extra: "(Medium) 40Mbps" },
  { title: "Convert to 4K", bitrate: 30000, extra: "30Mbps" },
  { title: "Convert to 1080p", bitrate: 20000, extra: "(High) 20Mbps" },
  { title: "Convert to 1080p", bitrate: 12000, extra: "(Medium) 12Mbps" },
  { title: "Convert to 1080p", bitrate: 8000, extra: "8Mbps" },
  { title: "Convert to 720p", bitrate: 4000, extra: "(High) 4Mbps" },
  { title: "Convert to 720p", bitrate: 3000, extra: "(Medium) 3Mbps" },
  { title: "Convert to 720p", bitrate: 2000, extra: "2Mbps" },
  { title: "Convert to 480p", bitrate: 1500, extra: "1.5Mbps" },
  { title: "Convert to 360p", bitrate: 750, extra: "0.7Mbps" },
  { title: "Convert to 240p", bitrate: 300, extra: "0.3Mbps" },
];

export function formatPlaybackTime(time: number) {
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time % 3600) / 60);
  const seconds = Math.floor(time % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

export function getPlaybackQualityOptions(
  resolution: string,
  _extraForOriginal = "Auto",
) {
  const firstOption = resolution.toLowerCase() === "4k"
    ? 0
    : resolution === "720"
      ? 6
      : 3;
  return qualityOptions.slice(firstOption);
}
