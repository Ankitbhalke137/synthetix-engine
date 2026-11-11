"use client";

import { useCallback, useEffect, useRef } from "react";

/** A caption received from the STT pipeline. */
export type CaptionEntry = {
  seq: number;
  speaker: string;
  speakerId: string;
  text: string;
  startMs: number;
  endMs: number;
  language?: string;
  duration?: number;
};

/**
 * useCaptionStream — captures the local mic, runs the VAD worklet, posts WAV
 * chunks to /api/stt/transcribe, and feeds captions back via onCaption.
 *
 * The mic stream is owned here (started while `enabled`, stopped otherwise).
 * The worklet never touches the main thread with PCM; it only posts meter RMS
 * and finished WAV chunks. Permission denial is silent — captions stay off
 * and the call continues.
 *
 * `enabled` must reflect real user intent (captions open AND the local mic is
 * live). Capturing unconditionally would prompt for the mic a second time and
 * keep transcribing audio the user believes is muted.
 */
export function useCaptionStream({
  roomId,
  enabled,
  onCaption,
  onMeter,
}: {
  roomId: string;
  enabled: boolean;
  onCaption: (entry: CaptionEntry) => void;
  onMeter?: (rms: number) => void;
}) {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);

  const stop = useCallback(() => {
    runningRef.current = false;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    workletNodeRef.current?.disconnect();
    workletNodeRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  const postChunk = useCallback(
    async (audio: ArrayBuffer, startMs: number, endMs: number) => {
      if (!mountedRef.current) return;

      const form = new FormData();
      const blob = new Blob([audio], { type: "audio/wav" });
      form.append("roomId", roomId);
      // The chunk's position on the session timeline. The server prefers these
      // over Whisper's chunk-relative segment offsets.
      form.append("startMs", String(startMs));
      form.append("endMs", String(endMs));
      form.append("chunk", blob, "chunk.wav");

      try {
        const response = await fetch("/api/stt/transcribe", {
          method: "POST",
          body: form,
        });

        if (!mountedRef.current) return;

        if (!response.ok) {
          // 401/403/429/502/503 — drop the chunk, the call continues.
          return;
        }

        const payload = (await response.json().catch(() => null)) as {
          text?: string;
          speaker?: string;
          speakerId?: string;
          seq?: number;
          language?: string;
          duration?: number;
        } | null;

        const text = (payload?.text ?? "").trim();
        if (text && typeof payload?.seq === "number" && mountedRef.current) {
          onCaption({
            seq: payload.seq,
            speaker: payload?.speaker ?? "",
            speakerId: payload?.speakerId ?? "",
            text,
            startMs,
            endMs,
            language: payload?.language,
            duration: payload?.duration,
          });
        }
      } catch {
        // Network failure — drop the chunk, the call continues.
      }
    },
    [roomId, onCaption],
  );

  // Start the capture pipeline only while enabled.
  useEffect(() => {
    mountedRef.current = true;

    if (!enabled) {
      stop();
      return;
    }

    let disposed = false;
    runningRef.current = true;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
        });

        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;

        const AudioContext =
          window.AudioContext ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitAudioContext;

        if (!AudioContext) return;

        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;

        if (audioCtx.state === "suspended") {
          await audioCtx.resume().catch(() => undefined);
        }

        await audioCtx.audioWorklet.addModule("/worklets/audio-processor.js");

        if (disposed) {
          void audioCtx.close().catch(() => undefined);
          return;
        }

        const workletNode = new AudioWorkletNode(audioCtx, "audio-processor");
        workletNodeRef.current = workletNode;

        workletNode.port.onmessage = (event: MessageEvent) => {
          if (!mountedRef.current || !runningRef.current) return;
          const { type } = event.data;
          if (type === "meter") {
            onMeter?.(event.data.rms);
          } else if (type === "chunk") {
            void postChunk(
              event.data.audio as ArrayBuffer,
              event.data.startMs,
              event.data.endMs,
            );
          }
        };

        const source = audioCtx.createMediaStreamSource(stream);
        sourceRef.current = source;
        source.connect(workletNode);
        // Deliberately NOT connected to audioCtx.destination: that would play
        // the local mic back through the speakers (echo/feedback). The worklet
        // does not need a downstream sink to process input.
      } catch {
        // Permission denied or unsupported — captions stay off, call continues.
        runningRef.current = false;
      }
    }

    void start();

    return () => {
      disposed = true;
      mountedRef.current = false;
      stop();
    };
  }, [enabled, postChunk, stop, onMeter]);

  return { stop };
}
