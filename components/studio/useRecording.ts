"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Recording lifecycle states. */
export type RecordingState = "idle" | "recording" | "uploading" | "stopping" | "error";

/** A completed part uploaded to Neon Object Storage. */
export type UploadedPart = { PartNumber: number; ETag: string };

/**
 * useRecording — host-side recording via MediaRecorder + presigned multipart
 * upload to Neon Object Storage.
 *
 * Flow:
 *  1. start() → create MediaStream from local mic track → MediaRecorder(10s slices)
 *     → POST /api/storage/presigned/init → uploadId
 *  2. ondataavailable → POST /api/storage/presigned/part → PUT blob → record ETag
 *  3. stop() → mediaRecorder.stop() → POST /api/storage/complete → Recording row
 *
 * Permission denial, unsupported browser, or upload failures degrade
 * gracefully — the call continues without recording.
 */
export function useRecording({
  roomId,
  audioTrack,
  isHost,
  isConnected,
}: {
  roomId: string;
  audioTrack: { mediaStreamTrack: MediaStreamTrack } | null;
  isHost: boolean;
  isConnected: boolean;
}) {
  const [state, setState] = useState<RecordingState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [partCount, setPartCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadIdRef = useRef<string | null>(null);
  const recordingIdRef = useRef<string | null>(null);
  const partsRef = useRef<UploadedPart[]>([]);
  const partNumberRef = useRef(0);
  const abortRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  // Upload a single part with retry on expired URLs (403/410).
  // The implementation lives in a ref so the recursive self-call never
  // touches the component render cycle.
  const uploadPartWithRetryRef = useRef<(
    blob: Blob,
    partNumber: number,
    attempt: number,
  ) => Promise<void> | null>(null);

  useEffect(() => {
    uploadPartWithRetryRef.current = async (blob, partNumber, attempt) => {
      if (attempt > 3 || abortRef.current) return;

      // Wait briefly before retrying.
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));

      try {
        const presignResponse = await fetch("/api/storage/presigned/part", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roomId,
            recordingId: recordingIdRef.current!,
            partNumber,
            uploadId: uploadIdRef.current!,
          }),
        });

        if (!presignResponse.ok) {
          await uploadPartWithRetryRef.current?.(blob, partNumber, attempt + 1);
          return;
        }

        const { url } = (await presignResponse.json()) as { url: string };
        const putResponse = await fetch(url, { method: "PUT", body: blob });

        if ((putResponse.status === 403 || putResponse.status === 410) && attempt < 3) {
          await uploadPartWithRetryRef.current?.(blob, partNumber, attempt + 1);
          return;
        }

        if (!putResponse.ok) {
          setError(`Upload failed after ${attempt} retries.`);
          setState("idle");
          return;
        }

        const etag = putResponse.headers.get("etag") ?? "";
        partsRef.current.push({ PartNumber: partNumber, ETag: etag });
        setPartCount(partsRef.current.length);
      } catch {
        await uploadPartWithRetryRef.current?.(blob, partNumber, attempt + 1);
      }
    };
  }, [roomId]);

  const uploadPartWithRetry = useCallback(
    (blob: Blob, partNumber: number, attempt: number) => {
      return uploadPartWithRetryRef.current?.(blob, partNumber, attempt);
    },
    [],
  );

  // --- start recording -----------------------------------------------------

  const start = useCallback(async () => {
    if (!isHost || !isConnected || !audioTrack) return;
    if (typeof MediaRecorder === "undefined") {
      setError("Your browser does not support recording.");
      return;
    }

    setError(null);
    setState("recording");
    partsRef.current = [];
    partNumberRef.current = 0;
    abortRef.current = false;

    try {
      // Build a MediaStream from the local mic track.
      const stream = new MediaStream([audioTrack.mediaStreamTrack]);
      streamRef.current = stream;

      const recordingId = crypto.randomUUID();
      recordingIdRef.current = recordingId;

      // Initiate the multipart upload on the server.
      const initResponse = await fetch("/api/storage/presigned/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId,
          recordingId,
          mimeType: "audio/webm",
        }),
      });

      if (!initResponse.ok) {
        const body = (await initResponse.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Failed to start recording upload.");
      }

      const { uploadId } = (await initResponse.json()) as { uploadId: string };
      uploadIdRef.current = uploadId;

      // MediaRecorder fires ondataavailable every timeslice ms.
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = async (event: BlobEvent) => {
        if (abortRef.current || !event.data || event.data.size === 0) return;

        setState("uploading");
        partNumberRef.current += 1;
        const partNumber = partNumberRef.current;

        try {
          // Presign a PUT URL for this part.
          const presignResponse = await fetch("/api/storage/presigned/part", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              roomId,
              recordingId,
              partNumber,
              uploadId,
            }),
          });

          if (!presignResponse.ok) {
            throw new Error(`Presign failed: ${presignResponse.status}`);
          }

          const { url } = (await presignResponse.json()) as { url: string };

          // PUT the part directly to Neon.
          const putResponse = await fetch(url, {
            method: "PUT",
            body: event.data,
            headers: { "content-type": "audio/webm" },
          });

          if (!putResponse.ok) {
            // 403/410 = expired URL; retry via uploadPartWithRetry.
            if (putResponse.status === 403 || putResponse.status === 410) {
              await uploadPartWithRetry(event.data, partNumber, 1);
              return;
            }
            throw new Error(`Upload failed: ${putResponse.status}`);
          }

          const etag = putResponse.headers.get("etag") ?? "";
          partsRef.current.push({ PartNumber: partNumber, ETag: etag });
          setPartCount(partsRef.current.length);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Upload failed.");
          setState("idle");
        }
      };

      mediaRecorder.onerror = () => {
        setError("MediaRecorder error.");
        setState("idle");
      };

      mediaRecorder.start(10_000); // 10 s slices
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start recording.");
      setState("idle");
    }
  }, [roomId, audioTrack, isHost, isConnected, uploadPartWithRetry]);

  // --- stop recording ------------------------------------------------------

  const stop = useCallback(async () => {
    if (!mediaRecorderRef.current) return;

    abortRef.current = false;
    setState("stopping");

    try {
      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());

      mediaRecorderRef.current = null;
      streamRef.current = null;

      // Wait for the final ondataavailable to complete, then complete.
      await new Promise((resolve) => setTimeout(resolve, 1_500));

      const uploadId = uploadIdRef.current;
      const recordingId = recordingIdRef.current;
      const parts = [...partsRef.current];

      if (!uploadId || !recordingId) {
        setState("idle");
        return;
      }

      const completeResponse = await fetch("/api/storage/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ roomId, recordingId, uploadId, parts }),
      });

      if (!completeResponse.ok) {
        throw new Error(`Complete failed: ${completeResponse.status}`);
      }

      setState("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete recording.");
      setState("idle");
    }
  }, [roomId]);

  // --- cleanup on unmount --------------------------------------------------

  useEffect(() => {
    return () => {
      abortRef.current = true;
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
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
