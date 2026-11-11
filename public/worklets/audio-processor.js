// AudioWorklet processor: VAD + level meter + WAV chunk assembly.
// Runs on the audio thread; main thread never sees PCM (keeps 60 fps UI).
//
// Chunk emission policy (binding ADR-003): VAD chunks 8–12 s, active speaker
// only. Emit when (speech ended AND chunk ≥ 6 s) OR chunk ≥ 12 s (max) OR
// silence flush at 15 s. Floor of 6 s keeps RPM headroom for multi-speaker.
const TARGET_SAMPLE_RATE = 16000; // Groq STT consistency
const FRAME_MS = 10; // analysis frame
const HANGOVER_FRAMES = 60; // 600 ms silence hangover
const MIN_CHUNK_S = 6; // emit only if ≥ 6 s of speech
const MAX_CHUNK_S = 12; // hard cap (Groq min-billable is 10 s)
const FLUSH_S = 15; // never hold a chunk longer than 15 s
const VOICED_START_FRAMES = 3; // 3 consecutive voiced frames = speech start
const ENERGY_MULTIPLIER = 4; // voiced if energy > noiseFloor * 4

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Downsample buffer: accumulate native-rate samples, emit 16 kHz frames.
    this._downsampleAccum = 0;
    this._downsampleCount = 0;
    this._downsampleRatio = this.sampleRate / TARGET_SAMPLE_RATE;

    // Accumulated 16 kHz PCM for the current chunk.
    this._pcm = [];

    // VAD state.
    this._noiseFloor = 0.001;
    this._voicedRun = 0;
    this._silenceRun = 0;
    this._speaking = false;
    this._chunkStartTime = 0;
    this._seq = 0;

    // Level meter state (RMS per 50 ms).
    this._rmsSum = 0;
    this._rmsCount = 0;
    this._meterInterval = Math.round((this.sampleRate * 50) / 1000);

    this.port.onmessage = () => {
      // No client-to-worklet commands yet; reserved for future mute/reset.
    };
  }

  process(inputs, _outputs, _parameters) {
    void _outputs;
    void _parameters;
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channel = input[0]; // Float32Array, mono (channel 0)
    const frameSize = Math.round(this.sampleRate * (FRAME_MS / 1000));
    const now = performance.now();

    // Walk the input block in analysis frames.
    for (let offset = 0; offset < channel.length; offset += frameSize) {
      const frame = channel.subarray(offset, offset + frameSize);
      if (frame.length === 0) continue;

      const energy = this._rms(frame);
      const voiced = energy > this._noiseFloor * ENERGY_MULTIPLIER;

      // Adaptive noise floor (EMA).
      if (voiced) {
        this._noiseFloor = 0.9 * this._noiseFloor + 0.1 * energy;
        this._voicedRun += 1;
        this._silenceRun = 0;
      } else {
        this._noiseFloor = 0.99 * this._noiseFloor + 0.01 * energy;
        this._silenceRun += 1;
        if (this._speaking) this._voicedRun = 0;
      }

      // Speech start: 3 consecutive voiced frames.
      if (!this._speaking && this._voicedRun >= VOICED_START_FRAMES) {
        this._speaking = true;
        this._chunkStartTime = now;
        this._pcm = [];
      }

      // Downsample + accumulate PCM while speaking.
      if (this._speaking) {
        this._accumulateFrame(frame);
      }

      // Chunk boundary checks.
      const chunkS = this._pcm.length / TARGET_SAMPLE_RATE;
      const hangoverS = this._silenceRun * (FRAME_MS / 1000);

      let emit = false;
      if (
        this._speaking &&
        this._voicedRun === 0 &&
        hangoverS >= HANGOVER_FRAMES * (FRAME_MS / 1000)
      ) {
        // Speech ended: emit if we have enough audio.
        emit = chunkS >= MIN_CHUNK_S;
      } else if (chunkS >= MAX_CHUNK_S) {
        emit = true; // hard cap
      } else if (chunkS >= FLUSH_S) {
        emit = true; // safety flush
      }

      if (emit) {
        this._emitChunk(now);
        this._speaking = false;
        this._voicedRun = 0;
        this._silenceRun = 0;
        this._chunkStartTime = 0;
      }
    }

    // Level meter: post RMS every 50 ms.
    this._rmsCount += channel.length;
    for (let i = 0; i < channel.length; i++) {
      this._rmsSum += channel[i] * channel[i];
    }
    if (this._rmsCount >= this._meterInterval) {
      const rms = Math.sqrt(this._rmsSum / this._rmsCount);
      this.port.postMessage({ type: "meter", rms });
      this._rmsSum = 0;
      this._rmsCount = 0;
    }

    return true;
  }

  _rms(frame) {
    let sum = 0;
    for (let i = 0; i < frame.length; i++) {
      const s = frame[i];
      sum += s * s;
    }
    return Math.sqrt(sum / frame.length);
  }

  // Downsample native-rate frame to 16 kHz and append to chunk PCM.
  _accumulateFrame(frame) {
    const ratio = this._downsampleRatio;

    for (let i = 0; i < frame.length; i++) {
      this._downsampleAccum += frame[i];
      this._downsampleCount += 1;
      if (this._downsampleCount >= ratio) {
        this._pcm.push(this._downsampleAccum / this._downsampleCount);
        this._downsampleAccum = 0;
        this._downsampleCount = 0;
      }
    }
  }

  _emitChunk(endTime) {
    if (this._pcm.length === 0) return;

    const pcm16 = new Int16Array(this._pcm.length);
    for (let i = 0; i < this._pcm.length; i++) {
      let s = this._pcm[i];
      s = Math.max(-1, Math.min(1, s));
      pcm16[i] = s < 0 ? s * 32768 : s * 32767;
    }

    const wav = this._encodeWav(pcm16);
    const seq = this._seq;
    this._seq += 1;

    this._pcm = [];

    this.port.postMessage(
      {
        type: "chunk",
        seq,
        startMs: Math.round(this._chunkStartTime),
        endMs: Math.round(endTime),
        audio: wav,
      },
      [wav.buffer],
    );
  }

  _encodeWav(pcm16) {
    const byteRate = TARGET_SAMPLE_RATE * 2; // 16 kHz * 2 bytes
    const dataSize = pcm16.length * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i += 1) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(0, "RIFF");
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    view.setUint32(16, 16, true); // PCM fmt chunk size
    view.setUint16(20, 1, true); // format = PCM
    view.setUint16(22, 1, true); // channels = 1
    view.setUint32(24, TARGET_SAMPLE_RATE, true); // sample rate
    view.setUint32(28, byteRate, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(36, "data");
    view.setUint32(40, dataSize, true);

    for (let i = 0; i < pcm16.length; i += 1) {
      view.setInt16(44 + i * 2, pcm16[i], true);
    }

    return buffer;
  }
}

registerProcessor("audio-processor", AudioProcessor);
