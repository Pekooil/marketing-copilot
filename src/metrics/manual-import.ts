import { createHash } from "node:crypto";

import { z } from "zod";

import { metricDefinitionKey } from "./definition";
import {
  assertMetricValueState,
  metricQualityStateSchema,
  qualityScoreByState,
} from "./quality";

export const manualImportHeaders = [
  "metric",
  "value",
  "window_start",
  "window_end",
  "segment",
  "fresh_as_of",
  "quality_state",
  "source_note",
] as const;

const maxCsvBytes = 256_000;
const maxRows = 500;

export const manualMetricRowSchema = z.object({
  rowNumber: z.number().int().positive(),
  metricName: z.string().trim().min(1).max(120),
  value: z.number().finite().nullable(),
  windowStart: z.iso.datetime(),
  windowEnd: z.iso.datetime(),
  segment: z.string().trim().min(1).max(300),
  freshAsOf: z.iso.datetime(),
  qualityState: metricQualityStateSchema,
  qualityScore: z.number().min(0).max(1),
  sourceNote: z.string().trim().min(1).max(500),
  rowKey: z.string().regex(/^[a-f0-9]{64}$/),
});

export type ManualMetricRow = z.infer<typeof manualMetricRowSchema>;

export interface CsvRowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ManualImportPreview {
  headers: string[];
  rows: ManualMetricRow[];
  errors: CsvRowError[];
  sourceHash: string;
  totalRows: number;
}

export function parseManualMetricsCsv(csv: string): ManualImportPreview {
  if (Buffer.byteLength(csv, "utf8") > maxCsvBytes) {
    throw new CsvImportError("CSV files must be 256 KB or smaller.");
  }

  const sourceHash = createHash("sha256").update(csv).digest("hex");
  const records = parseCsvRecords(csv.replace(/^\uFEFF/, ""));
  if (records.length === 0) throw new CsvImportError("The CSV is empty.");
  if (records.length - 1 > maxRows) {
    throw new CsvImportError(`CSV files can contain at most ${maxRows} data rows.`);
  }

  const headers = records[0].map((header) => header.trim().toLowerCase());
  const duplicateHeaders = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicateHeaders.length > 0) {
    throw new CsvImportError(`Duplicate CSV header: ${duplicateHeaders[0]}.`);
  }
  const missingHeaders = manualImportHeaders.filter((header) => !headers.includes(header));
  if (missingHeaders.length > 0) {
    throw new CsvImportError(`Missing required CSV headers: ${missingHeaders.join(", ")}.`);
  }

  const index = Object.fromEntries(headers.map((header, position) => [header, position]));
  const rows: ManualMetricRow[] = [];
  const errors: CsvRowError[] = [];

  records.slice(1).forEach((record, offset) => {
    const rowNumber = offset + 2;
    if (record.every((cell) => !cell.trim())) return;
    const raw = Object.fromEntries(
      manualImportHeaders.map((header) => [header, record[index[header]]?.trim() ?? ""]),
    );
    const rowErrors: CsvRowError[] = [];
    const quality = metricQualityStateSchema.safeParse(raw.quality_state.toLowerCase());
    if (!quality.success) rowErrors.push(issue(rowNumber, "quality_state", "Use current, stale, missing, conflicted, invalid, or unknown."));
    const value = raw.value === "" ? null : Number(raw.value);
    if (raw.value !== "" && !Number.isFinite(value)) rowErrors.push(issue(rowNumber, "value", "Enter a finite number or leave it blank."));
    const windowStart = parseTimestamp(raw.window_start, rowNumber, "window_start", rowErrors);
    const windowEnd = parseTimestamp(raw.window_end, rowNumber, "window_end", rowErrors);
    const freshAsOf = parseTimestamp(raw.fresh_as_of, rowNumber, "fresh_as_of", rowErrors);
    if (windowStart && windowEnd && windowEnd <= windowStart) {
      rowErrors.push(issue(rowNumber, "window_end", "Window end must be after window start."));
    }
    for (const [field, limit] of [["metric", 120], ["segment", 300], ["source_note", 500]] as const) {
      const text = raw[field];
      if (!text) rowErrors.push(issue(rowNumber, field, "This field is required."));
      else if (text.length > limit) rowErrors.push(issue(rowNumber, field, `Use ${limit} characters or fewer.`));
    }
    if (quality.success && (raw.value === "" || Number.isFinite(value))) {
      try {
        assertMetricValueState(quality.data, value);
      } catch (error) {
        rowErrors.push(issue(rowNumber, "value", error instanceof Error ? error.message : "Value and quality state conflict."));
      }
    }

    if (rowErrors.length > 0 || !quality.success || !windowStart || !windowEnd || !freshAsOf) {
      errors.push(...rowErrors);
      return;
    }

    const canonical = [
      metricDefinitionKey(raw.metric),
      value === null ? "null" : String(value),
      windowStart,
      windowEnd,
      raw.segment,
      freshAsOf,
      quality.data,
      raw.source_note,
    ].join("\u001f");
    rows.push(manualMetricRowSchema.parse({
      rowNumber,
      metricName: raw.metric,
      value,
      windowStart,
      windowEnd,
      segment: raw.segment,
      freshAsOf,
      qualityState: quality.data,
      qualityScore: qualityScoreByState[quality.data],
      sourceNote: raw.source_note,
      rowKey: createHash("sha256").update(canonical).digest("hex"),
    }));
  });

  return { headers, rows, errors, sourceHash, totalRows: Math.max(records.length - 1, 0) };
}

export class CsvImportError extends Error {
  readonly code = "CSV_IMPORT_INVALID";
}

function parseCsvRecords(csv: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (quoted) {
      if (character === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new CsvImportError("The CSV contains an unclosed quoted field.");
  if (field || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }
  return records;
}

function parseTimestamp(value: string, rowNumber: number, field: string, errors: CsvRowError[]) {
  const parsed = z.iso.datetime().safeParse(value);
  if (!parsed.success) {
    errors.push(issue(rowNumber, field, "Use an ISO 8601 timestamp with timezone."));
    return null;
  }
  return parsed.data;
}

function issue(rowNumber: number, field: string, message: string): CsvRowError {
  return { rowNumber, field, message };
}
