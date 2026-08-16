import { z } from "zod";

export const metricUnitSchema = z.enum([
  "count",
  "percentage",
  "currency_minor",
  "seconds",
  "custom",
]);

export const metricAggregationSchema = z.enum([
  "count",
  "sum",
  "average",
  "unique",
  "ratio",
  "latest",
]);

export const metricDefinitionInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    businessDefinition: z.string().trim().min(1).max(1_000),
    unit: metricUnitSchema,
    customUnit: z.string().trim().max(80).default(""),
    aggregation: metricAggregationSchema,
    segment: z.string().trim().min(1).max(300),
    exclusions: z.array(z.string().trim().min(1).max(300)).max(30).default([]),
    timezone: z.string().trim().min(1).max(80).refine(isIanaTimezone, "Use a valid IANA timezone."),
    freshnessHours: z.number().int().min(1).max(8_760),
  })
  .superRefine((value, context) => {
    if (value.unit === "custom" && !value.customUnit) {
      context.addIssue({ code: "custom", path: ["customUnit"], message: "Name the custom unit." });
    }
    if (value.unit !== "custom" && value.customUnit) {
      context.addIssue({ code: "custom", path: ["customUnit"], message: "Custom unit applies only when unit is custom." });
    }
    if (new Set(value.exclusions.map((item) => item.toLowerCase())).size !== value.exclusions.length) {
      context.addIssue({ code: "custom", path: ["exclusions"], message: "Exclusions must be unique." });
    }
  });

export type MetricDefinitionInput = z.infer<typeof metricDefinitionInputSchema>;

export function metricDefinitionKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function isIanaTimezone(value: string) {
  if (value !== "UTC" && !/^[A-Za-z_]+\/[A-Za-z0-9_+.-]+(?:\/[A-Za-z0-9_+.-]+)?$/.test(value)) {
    return false;
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
