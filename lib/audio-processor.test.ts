import { describe, expect, it } from "vitest";

import { AudioProcessor } from "./audio-processor";

/** Build a Float32Array of silence (zeros) for `durationMs` at `sampleRate`. */
function silence(durationMs: number, sampleRate = 48000): Float32Array {
  return new Float32Array(Math.round((sampleRate * durationMs) / 1000));
}

/** Build a Float32Array of constant-amplitude tone for `durationMs`. */
function tone(
  durationMs: number,
  amplitude: number,
  sampleRate = 48000,
): Float32Array {
  const samples = new Float32Array(Math.round((sampleRate * durationMs) / 1000));
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = amplitude;
  }
  return samples;
}

function feed(processor: AudioProcessor, samples: Float32Array): void {
  processor.process([[samples]]);
}

describe("AudioProcessor VAD transitions", () => {
  it("stays idle on silence (no chunks emitted)", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // 30 seconds of silence — no speech, no chunks.
    feed(processor, silence(30000));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(0);
  });

  it("emits a chunk after ≥ 6 s of speech followed by 600 ms hangover", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // 7 seconds of loud speech.
    feed(processor, tone(7000, 0.5));
    // 1 second of silence (hangover passes).
    feed(processor, silence(1000));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].msg.seq).toBe(0);
  });

  it("does not emit a chunk for speech shorter than 6 s (min-chunk floor)", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // 4 seconds of speech, then silence — clearly below 6 s floor.
    feed(processor, tone(4000, 0.5));
    feed(processor, silence(2000));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(0);
  });

  it("emits at the 12 s hard cap even without hangover", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // 13 seconds of continuous speech — should hit max-chunk cap at 12 s.
    feed(processor, tone(13000, 0.5));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].msg.seq).toBe(0);
  });

  it("emits at the 15 s flush even without speech end", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // 16 seconds of speech — flush at 15 s.
    feed(processor, tone(16000, 0.5));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0].msg.seq).toBe(0);
  });

  it("assigns sequential seq numbers across multiple chunks", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // Multiple utterances separated by silence long enough for hangover.
    feed(processor, tone(7000, 0.5));
    feed(processor, silence(3000));
    feed(processor, tone(7000, 0.5));
    feed(processor, silence(3000));
    feed(processor, tone(7000, 0.5));
    feed(processor, silence(3000));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(3);
    expect(chunks[0].msg.seq).toBe(0);
    expect(chunks[1].msg.seq).toBe(1);
    expect(chunks[2].msg.seq).toBe(2);
  });

  it("emits meter messages during processing", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    feed(processor, tone(1000, 0.5));

    const meters = processor.messages.filter((m) => m.msg.type === "meter");
    expect(meters.length).toBeGreaterThan(0);
    expect(meters[0].msg.rms).toBeGreaterThan(0);
  });

  it("reports zero RMS for silence", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    feed(processor, silence(1000));

    const meters = processor.messages.filter((m) => m.msg.type === "meter");
    if (meters.length > 0) {
      expect((meters[0].msg as unknown as { rms: number }).rms).toBeCloseTo(
        0,
        4,
      );
    }
  });

  it("encodes valid WAV header", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    // Generate a chunk to trigger WAV encoding.
    feed(processor, tone(7000, 0.5));
    feed(processor, silence(1000));

    const chunks = processor.messages.filter(
      (m) => m.msg.type === "chunk",
    );
    expect(chunks).toHaveLength(1);

    const wav = chunks[0].msg.audio as ArrayBuffer;
    const view = new DataView(wav);

    // RIFF header.
    const riff = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3),
    );
    expect(riff).toBe("RIFF");

    const wave = String.fromCharCode(
      view.getUint8(8),
      view.getUint8(9),
      view.getUint8(10),
      view.getUint8(11),
    );
    expect(wave).toBe("WAVE");

    // fmt chunk.
    const fmt = String.fromCharCode(
      view.getUint8(12),
      view.getUint8(13),
      view.getUint8(14),
      view.getUint8(15),
    );
    expect(fmt).toBe("fmt ");

    // PCM format = 1, channels = 1, sample rate = 16000, 16-bit.
    expect(view.getUint16(20, true)).toBe(1); // format PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16000); // sample rate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample

    // data chunk.
    const data = String.fromCharCode(
      view.getUint8(36),
      view.getUint8(37),
      view.getUint8(38),
      view.getUint8(39),
    );
    expect(data).toBe("data");
  });

  it("startMs/endMs reflect media timeline", () => {
    const processor = new AudioProcessor();
    processor.setSampleRate(48000);

    feed(processor, tone(7000, 0.5));
    feed(processor, silence(1000));

    const chunks = processor.messages.filter((m) => m.msg.type === "chunk");
    expect(chunks).toHaveLength(1);
    const chunkMsg = chunks[0].msg as unknown as {
      startMs: number;
      endMs: number;
    };
    expect(chunkMsg.startMs).toBeGreaterThanOrEqual(0);
    expect(chunkMsg.endMs).toBeGreaterThanOrEqual(chunkMsg.startMs);
  });
});
