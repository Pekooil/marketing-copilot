import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { calculateFunnelConversions, type FunnelObservation } from "@/metrics/funnel";
import { CsvImportError, parseManualMetricsCsv } from "@/metrics/manual-import";

const header = "metric,value,window_start,window_end,segment,fresh_as_of,quality_state,source_note";
const base = {
  windowStart: "2026-08-01T00:00:00Z",
  windowEnd: "2026-08-08T00:00:00Z",
  segment: "all",
  timezone: "UTC",
};

describe("Sprint 3 trustworthy manual-data evaluation", () => {
  it("preserves observed zero while unknown remains valueless", () => {
    const preview = parseManualMetricsCsv(`${header}\nVisits,0,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,all,2026-08-08T01:00:00Z,current,Manual export\nActivation,,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,all,2026-08-08T01:00:00Z,unknown,Not tracked`);
    expect(preview.errors).toEqual([]);
    expect(preview.rows.map(({ value, qualityState }) => ({ value, qualityState }))).toEqual([
      { value: 0, qualityState: "current" },
      { value: null, qualityState: "unknown" },
    ]);
  });

  it("fails a malformed file closed before any valid preview exists", () => {
    expect(() => parseManualMetricsCsv(`${header}\n"Visits,12`)).toThrow(CsvImportError);
    const invalid = parseManualMetricsCsv(`${header}\nVisits,,bad,bad,,bad,current,`);
    expect(invalid.rows).toEqual([]);
    expect(invalid.errors.length).toBeGreaterThan(3);
  });

  it("uses stable row identity for exact replay", () => {
    const csv = `${header}\nVisits,12,2026-08-01T00:00:00Z,2026-08-08T00:00:00Z,all,2026-08-08T01:00:00Z,current,Manual export`;
    const first = parseManualMetricsCsv(csv);
    const replay = parseManualMetricsCsv(csv);
    expect(replay.sourceHash).toBe(first.sourceHash);
    expect(replay.rows[0].rowKey).toBe(first.rows[0].rowKey);
  });

  it("marks disagreement conflicted, retains evidence, and never averages", async () => {
    const sql = await readFile(new URL("../../supabase/migrations/20260816140000_metrics_funnel.sql", import.meta.url), "utf8");
    expect(sql).toContain("v_snapshot_quality := 'conflicted'; v_snapshot_value := null");
    expect(sql).toContain("v_previous.evidence_refs || jsonb_build_array(v_observation_id)");
    expect(sql).not.toMatch(/avg\s*\(.*value_numeric/i);
  });

  it("refuses conversions across incompatible scopes", () => {
    const observations: FunnelObservation[] = [
      { ...base, stage: "acquisition", value: 100, qualityState: "current", snapshotId: "one" },
      { ...base, stage: "activation", value: 20, qualityState: "current", segment: "paid", snapshotId: "two" },
    ];
    expect(calculateFunnelConversions(observations)[0]).toMatchObject({ state: "unavailable", rate: null, reason: "incompatible_scope" });
  });
});
