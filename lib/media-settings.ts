import {
  AudioPresets,
  VideoPresets,
  type AudioCaptureOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from "livekit-client";

/**
 * One place for the A/V quality contract, shared by the pre-join preview, the
 * LiveKit room and the recorder.
 *
 * Defaults are deliberately explicit: LiveKit would otherwise capture at 720p
 * and fall back to `maintain-framerate`, which is the wrong trade-off for a
 * demo where faces and slides should stay sharp.
 */

/** Browser-side speech capture: mono, full-band, with the platform cleaners. */
export const AUDIO_CAPTURE_OPTIONS: AudioCaptureOptions = {
  autoGainControl: true,
  echoCancellation: true,
  noiseSuppression: true,
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48_000,
};

/** Capture at 1080p where the camera allows it; browsers downscale gracefully. */
export const VIDEO_CAPTURE_OPTIONS: VideoCaptureOptions = {
  resolution: VideoPresets.h1080.resolution,
  frameRate: 30,
};

/**
 * Publish three simulcast layers (1080p primary + 720p + 360p). Subscribers on
 * small tiles get the cheap layer, while the active-speaker tile receives the
 * full-resolution stream.
 *
 * `dtx` is off: discontinuous transmission clips the first phoneme of a word
 * and makes recordings sound choppy. Opus at 48 kbps mono is still cheap.
 */
export const PUBLISH_OPTIONS: TrackPublishOptions = {
  audioPreset: AudioPresets.music,
  dtx: false,
  red: true,
  simulcast: true,
  videoCodec: "vp8",
  videoEncoding: VideoPresets.h1080.encoding,
  videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
  degradationPreference: "maintain-resolution",
};

/**
 * Pre-join preview constraints. 720p keeps the preview responsive while still
 * looking like the HD stream guests will receive (instead of the browser's VGA
 * default).
 */
export const PREVIEW_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  },
  audio: {
    autoGainControl: true,
    echoCancellation: true,
    noiseSuppression: true,
    channelCount: { ideal: 1 },
    sampleRate: { ideal: 48_000 },
  },
};
