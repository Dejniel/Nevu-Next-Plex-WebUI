#!/usr/bin/env bash
set -euo pipefail

# Generate synthetic files for the standalone Plex test library.
# Existing files are retained. FFmpeg is only needed on the machine generating samples.
command -v ffmpeg >/dev/null || { echo 'Install FFmpeg to generate playback samples.' >&2; exit 1; }
samples_dir="${1:-/tmp/nevu-test-media/PlaybackSamples}"
mkdir -p "$samples_dir"
mp4_sample="$samples_dir/Nevu MP4 Sample (2026).mp4"
long_mp4_sample="$samples_dir/Nevu Long MP4 Sample (2026).mp4"
mkv_sample="$samples_dir/Nevu MKV Sample (2026).mkv"
ac3_sample="$samples_dir/Nevu AC3 Sample (2026).mkv"
hevc_sample="$samples_dir/Nevu HEVC Sample (2026).mkv"
ass_sample="$samples_dir/Nevu ASS Sample (2026).mkv"
vp9_sample="$samples_dir/Nevu VP9 Sample (2026).mkv"
srt_sample="$samples_dir/Playback.srt"
ass_subtitle="$samples_dir/Playback.ass"

if [[ ! -f "$srt_sample" ]]; then
  cat > "$srt_sample" <<'SUBTITLES'
1
00:00:01,000 --> 00:00:08,000
Nevu subtitle sample

2
00:00:10,000 --> 00:00:23,000
Seek and resume sample
SUBTITLES
fi
if [[ ! -f "$mp4_sample" ]]; then
  ffmpeg -hide_banner -loglevel error -n \
    -f lavfi -i 'testsrc2=size=640x360:rate=24:duration=60' \
    -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=60' \
    -c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac -movflags +faststart "$mp4_sample"
fi
if [[ ! -f "$long_mp4_sample" ]]; then
  # Ten minutes, with MP4 metadata at the end, to check segmented start/buffering.
  ffmpeg -hide_banner -loglevel error -n -stream_loop 9 -i "$mp4_sample" \
    -map 0 -c copy -t 600 "$long_mp4_sample"
fi
if [[ ! -f "$mkv_sample" ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$mp4_sample" \
    -f lavfi -i 'sine=frequency=880:sample_rate=48000:duration=60' -i "$srt_sample" \
    -map 0:v -map 0:a -map 1:a -map 2:s -c:v copy -c:a aac -c:s srt \
    -metadata:s:a:0 language=eng -metadata:s:a:1 language=pol -metadata:s:s:0 language=eng \
    -disposition:a:0 default -disposition:a:1 0 -disposition:s:0 0 "$mkv_sample"
fi
if [[ ! -f "$ac3_sample" ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$mp4_sample" -c:v copy -c:a ac3 "$ac3_sample"
fi
if [[ ! -f "$ass_subtitle" ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$srt_sample" "$ass_subtitle"
fi
if [[ ! -f "$ass_sample" ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$mp4_sample" -i "$ass_subtitle" \
    -map 0 -map 1 -c copy -metadata:s:s:0 language=eng -disposition:s:0 0 "$ass_sample"
fi
encoders="$(ffmpeg -hide_banner -encoders 2>/dev/null)"
if [[ ! -f "$vp9_sample" && "$encoders" == *libvpx-vp9* ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$mp4_sample" \
    -c:v libvpx-vp9 -cpu-used 8 -row-mt 1 -threads 2 -crf 35 -b:v 0 -c:a copy "$vp9_sample"
fi
if [[ ! -f "$hevc_sample" && "$encoders" == *libx265* ]]; then
  ffmpeg -hide_banner -loglevel error -n -i "$mp4_sample" \
    -c:v libx265 -preset ultrafast -pix_fmt yuv420p10le -x265-params 'log-level=error:pools=2' \
    -c:a ac3 "$hevc_sample"
fi
printf 'Playback samples: %s\n' "$samples_dir"
