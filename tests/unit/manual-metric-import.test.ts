import { describe, expect, it } from "vitest";

import { CsvImportError, parseManualMetricsCsv } from "@/metrics/manual-import";

const header = "metric,value,window_start,window_end,segment,fresh_as_of,quality_state,source_note";

describe("manual metric CSV preview", () => {
  it("parses typed rows, quoted commas, and preserves zero", () => {
    const preview = parseManualMetricsCsv(`${header}\r\nSignups,0,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,"US, self-serve",2026-08-08T01:00:00Z,current,"Founder export, cleaned"`);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0]).toMatchObject({ value: 0, qualityState: "current", segment: "US, self-serve", qualityScore: 1 });
    expect(preview.rows[0].rowKey).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("keeps unknown distinct from zero", () => {
    const preview = parseManualMetricsCsv(`${header}\nActivation,,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,all,2026-08-08T01:00:00Z,unknown,No baseline yet`);
    expect(preview.errors).toEqual([]);
    expect(preview.rows[0].value).toBeNull();
  });

  it("returns all row errors without committing an invalid preview", () => {
    const preview = parseManualMetricsCsv(`${header}\nActivation,0,2026-08-08T00:00:00Z,2026-08-01T00:00:00Z,,bad,unknown,`);
    expect(preview.rows).toEqual([]);
    expect(preview.errors.map((error) => error.field)).toEqual(expect.arrayContaining(["value", "window_end", "segment", "fresh_as_of", "source_note"]));
  });

  it("rejects missing headers and malformed quoting", () => {
    expect(() => parseManualMetricsCsv("metric,value\nSignups,1")).toThrow(CsvImportError);
    expect(() => parseManualMetricsCsv(`${header}\n"Signups,1`)).toThrow(/unclosed quoted/i);
  });

  it("produces the same row identity for a true replay", () => {
    const csv = `${header}\nSignups,12,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,all,2026-08-08T01:00:00Z,current,Manual export`;
    expect(parseManualMetricsCsv(csv).rows[0].rowKey).toBe(parseManualMetricsCsv(csv).rows[0].rowKey);
  });
});
