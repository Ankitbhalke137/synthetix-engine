"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Recording lifecycle states. */
export type RecordingState = "idle" | "recording" | "uploading" | "stopping" | "error";

/** A completed part uploaded to Neon Object Storage. */
export type UploadedPart = { PartNumber: number; ETag: string };

/**
 * S3/Neon rejects every non-final multipart part smaller than 5 MiB
 * (`EntityTooSmall`). MediaRecorder slices are far smaller than that, so bytes
 * are buffered here until a full part is available.
 */
const MIN_PART_BYTES = 5 * 1024 * 1024;

/** How often MediaRecorder hands us a blob. Small slices keep memory flat. */
const SLICE_MS = 1_000;

/** Preferred container/codec order. A/V first, then audio-only fallback. */
const VIDEO_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const AUDIO_MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * useRecording — host-side recording via MediaRecorder + presigned multipart
 * upload to Neon Object Storage.
 *
 * Flow:
 *  1. start() → wrap the published camera/mic tracks in a MediaStream →
 *     MediaRecorder → POST /api/storage/presigned/init → uploadId
 *  2. ondataavailable → buffer bytes until ≥ 5 MiB → POST presigned/part →
 *     PUT the part directly to Neon (sequential queue, ordered by part number)
 *  3. stop() → flush the final (possibly small) part → await the queue →
 *     POST /api/storage/complete with mimeType/size/duration → Recording row
 *
 * The recorder wraps the LiveKit tracks rather than capturing the device again,
 * and it never calls `track.stop()`: that would end the call's camera/mic.
 * Recording degrades to audio-only when the host has their camera off.
 *
 * Permission denial, unsupported browser, or upload failures degrade
 * gracefully — the call continues without recording.
 */
export function useRecording({
  roomId,
  audioTrack,
  videoTrack,
  isHost,
  isConnected,
}: {
  roomId: string;
  audioTrack: { mediaStreamTrack: MediaStreamTrack } | null;
  videoTrack: { mediaStreamTrack: MediaStreamTrack } | null;
  isHost: boolean;
  isConnected: boolean;
}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partCount, setPartCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const mimeTypeRef = useRef<string>("audio/webm");

  const partsRef = useRef<UploadedPart[]>([]);
  const nextPartNumberRef = useRef(1);

  // Bytes waiting for a full part. Flushed when they reach MIN_PART_BYTES or
  // when the recording stops.
  const pendingBlobsRef = useRef<Blob[]>([]);
  const pendingBytesRef = useRef(0);
  const totalBytesRef = useRef(0);

  // Parts upload one at a time, in part-number order. The chain always
  // resolves; the first failure is latched in uploadErrorRef.
  const uploadChainRef = useRef<Promise<void>>(Promise.resolve());
  const uploadErrorRef = useRef<string | null>(null);

  const startedAtRef = useRef(0);
  const abortRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const resetSession = useCallback(() => {
    partsRef.current = [];
    nextPartNumberRef.current = 1;
    pendingBlobsRef.current = [];
    pendingBytesRef.current = 0;
    totalBytesRef.current = 0;
    uploadChainRef.current = Promise.resolve();
    uploadErrorRef.current = null;
    recordingIdRef.current = null;
    uploadIdRef.current = null;
    setPartCount(0);
  }, []);

  /**
   * Presign + PUT one part, retrying with a fresh URL when the presigned URL
   * expires (403/410) or the network hiccups.
   */
  const uploadPart = useCallback(
    async (blob: Blob, partNumber: number): Promise<void> => {
      const recordingId = recordingIdRef.current;
      const uploadId = uploadIdRef.current;

      if (!recordingId || !uploadId) {
        throw new Error("Recording upload is not initialised.");
      }

      let lastError: unknown = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (abortRef.current) return;
        if (attempt > 0) await sleep(500 * attempt);

        try {
          const presignResponse = await fetch("/api/storage/presigned/part", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ roomId, recordingId, partNumber, uploadId }),
          });

          if (!presignResponse.ok) {
            lastError = new Error(`Presign failed (${presignResponse.status}).`);
            continue;
          }

          const { url } = (await presignResponse.json()) as { url: string };
          const putResponse = await fetch(url, {
            method: "PUT",
            body: blob,
            headers: { "content-type": mimeTypeRef.current },
          });

          if (putResponse.status === 403 || putResponse.status === 410) {
            // The presigned URL expired — mint a new one and retry.
            lastError = new Error("Upload URL expired.");
            continue;
          }

          if (!putResponse.ok) {
            lastError = new Error(`Upload failed (${putResponse.status}).`);
            continue;
          }

          const etag = putResponse.headers.get("etag");

          if (!etag) {
            throw new Error("Storage did not return an ETag for this part.");
          }

          partsRef.current.push({ PartNumber: partNumber, ETag: etag });
          setPartCount(partsRef.current.length);
          return;
        } catch (caught) {
          lastError = caught;
        }
      }

      throw lastError instanceof Error ? lastError : new Error("Upload failed.");
    },
    [roomId],
  );

  /**
   * Move whatever is buffered into one part and queue its upload. Called when
   * the buffer reaches the 5 MiB floor, and once more on stop for the final
   * (smaller) part.
   */
  const flushPendingPart = useCallback(() => {
    if (pendingBytesRef.current === 0) return;

    const blob = new Blob(pendingBlobsRef.current, { type: mimeTypeRef.current });
    pendingBlobsRef.current = [];
    pendingBytesRef.current = 0;
    totalBytesRef.current += blob.size;

    const partNumber = nextPartNumberRef.current;
    nextPartNumberRef.current += 1;

    setState((current) => (current === "recording" ? "uploading" : current));

    uploadChainRef.current = uploadChainRef.current
      .then(() => uploadPart(blob, partNumber))
      .catch((caught: unknown) => {
        uploadErrorRef.current ??=
          caught instanceof Error ? caught.message : "Recording upload failed.";
      });
  }, [uploadPart]);

  // --- start recording -----------------------------------------------------

  const start = useCallback(async () => {
    if (!isHost || !isConnected || !audioTrack) return;

    if (typeof MediaRecorder === "undefined") {
      setError("Your browser does not support recording.");
      setState("error");
      return;
    }

    resetSession();
    abortRef.current = false;
    setError(null);

    try {
      const mimeCandidates = videoTrack ? VIDEO_MIME_CANDIDATES : AUDIO_MIME_CANDIDATES;
      const mimeType = mimeCandidates.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      );

      if (!mimeType) {
        throw new Error(
          videoTrack
            ? "This browser cannot record WebM video."
            : "This browser cannot record Opus audio.",
        );
      }

      // Wrap the already-published tracks. Do not call getUserMedia again and
      // never stop these tracks — LiveKit owns them for the duration of the call.
      const mediaStream = new MediaStream([audioTrack.mediaStreamTrack]);
      if (videoTrack) mediaStream.addTrack(videoTrack.mediaStreamTrack);

      const mediaRecorder = new MediaRecorder(mediaStream, {
        mimeType,
        audioBitsPerSecond: 96_000,
        ...(videoTrack ? { videoBitsPerSecond: 3_000_000 } : {}),
      });

      mediaRecorderRef.current = mediaRecorder;
      mimeTypeRef.current = mediaRecorder.mimeType || mimeType;

      const recordingId = crypto.randomUUID();
      recordingIdRef.current = recordingId;

      const initResponse = await fetch("/api/storage/presigned/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, recordingId, mimeType: mimeTypeRef.current }),
      });

      if (!initResponse.ok) {
        const body = (await initResponse.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Failed to start recording upload.");
      }

      const { uploadId } = (await initResponse.json()) as { uploadId: string };
      uploadIdRef.current = uploadId;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (abortRef.current || !event.data || event.data.size === 0) return;

        pendingBlobsRef.current.push(event.data);
        pendingBytesRef.current += event.data.size;

        if (pendingBytesRef.current >= MIN_PART_BYTES) {
          flushPendingPart();
        }
      };

      mediaRecorder.onerror = () => {
        setError("The recorder stopped unexpectedly.");
        setState("error");
      };

      startedAtRef.current = Date.now();
      mediaRecorder.start(SLICE_MS);
      setState("recording");
    } catch (caught) {
      mediaRecorderRef.current = null;
      setError(caught instanceof Error ? caught.message : "Failed to start recording.");
      setState("error");
    }
  }, [roomId, audioTrack, videoTrack, isHost, isConnected, flushPendingPart, resetSession]);

  // --- stop recording ------------------------------------------------------

  const stop = useCallback(async () => {
    const mediaRecorder = mediaRecorderRef.current;

    if (!mediaRecorder) return;

    setState("stopping");
    abortRef.current = false;

    try {
      // `stop` fires one last `dataavailable` and then `stop`; waiting for the
      // stop event guarantees the final bytes are buffered before we flush.
      await new Promise<void>((resolve) => {
        mediaRecorder.addEventListener("stop", () => resolve(), { once: true });
        mediaRecorder.stop();
      });

      mediaRecorderRef.current = null;

      // Flush the tail as the final part, then wait for every queued PUT.
      flushPendingPart();
      await uploadChainRef.current;

      const recordingId = recordingIdRef.current;
      const uploadId = uploadIdRef.current;
      const parts = [...partsRef.current].sort((a, b) => a.PartNumber - b.PartNumber);

      if (uploadErrorRef.current) {
        throw new Error(uploadErrorRef.current);
      }

      if (!recordingId || !uploadId || parts.length === 0) {
        throw new Error("Nothing was captured — the recording was empty.");
      }

      const durationSec = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 100) / 10);

      const completeResponse = await fetch("/api/storage/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          recordingId,
          uploadId,
          parts,
          mimeType: mimeTypeRef.current,
          sizeBytes: totalBytesRef.current,
          durationSec,
        }),
      });

      if (!completeResponse.ok) {
        const body = (await completeResponse.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? "Failed to finalise the recording.");
      }

      resetSession();
      setState("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to complete recording.");
      setState("error");
    }
  }, [roomId, flushPendingPart, resetSession]);

  // --- cleanup on unmount --------------------------------------------------

  useEffect(() => {
    return () => {
      abortRef.current = true;

      const mediaRecorder = mediaRecorderRef.current;
      if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
      }
      // Deliberately no `track.stop()`: the wrapped track belongs to LiveKit.
      mediaRecorderRef.current = null;
    };
  }, []);

  const canStart = isHost && isConnected && !!audioTrack && state === "idle";
  const canStop = state === "recording" || state === "uploading" || state === "stopping";

  return {
    state,
    error,
    partCount,
    canStart,
    canStop,
    start,
    stop,
    clearError,
  };
}
