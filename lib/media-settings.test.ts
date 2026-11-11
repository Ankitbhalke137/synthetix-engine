import { describe, expect, it } from "vitest";

import {
  AUDIO_CAPTURE_OPTIONS,
  PREVIEW_CONSTRAINTS,
  PUBLISH_OPTIONS,
  VIDEO_CAPTURE_OPTIONS,
} from "./media-settings";

describe("media settings", () => {
  it("captures 1080p30 and publishes three simulcast layers", () => {
    expect(VIDEO_CAPTURE_OPTIONS.resolution).toMatchObject({
      width: 1920,
      height: 1080,
      frameRate: 30,
    });
    expect(PUBLISH_OPTIONS.videoEncoding?.maxBitrate).toBeGreaterThanOrEqual(2_000_000);
    expect(PUBLISH_OPTIONS.videoSimulcastLayers?.map((layer) => layer.height)).toEqual([360, 720]);
    expect(PUBLISH_OPTIONS.degradationPreference).toBe("maintain-resolution");
  });

  it("keeps voice clean: mono 48 kHz with DTX off", () => {
    expect(AUDIO_CAPTURE_OPTIONS).toMatchObject({
      autoGainControl: true,
      echoCancellation: true,
      noiseSuppression: true,
      channelCount: 1,
      sampleRate: 48_000,
    });
    expect(PUBLISH_OPTIONS.dtx).toBe(false);
    expect(PUBLISH_OPTIONS.red).toBe(true);
  });

  it("previews at 720p instead of the browser default", () => {
    expect(PREVIEW_CONSTRAINTS.video).toMatchObject({
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30 },
    });
  });
});
