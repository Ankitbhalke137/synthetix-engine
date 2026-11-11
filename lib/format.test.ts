import { describe, expect, it } from "vitest";

import { formatBytes, formatDuration, formatTimestamp } from "./format";

describe("formatBytes", () => {
  it("handles empty and byte values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });

  it("scales to MB and GB", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });
});

describe("formatDuration", () => {
  it("formats minutes and hours", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("guards against negative and non-finite input", () => {
    expect(formatDuration(-10)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });
});

describe("formatTimestamp", () => {
  it("converts session milliseconds", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(90_500)).toBe("1:31");
  });
});
