# Sprint 3 metric, import, and funnel contracts

## Scope

Sprint 3 establishes trustworthy manual metrics before any external connector. A founder can define metrics, import bounded CSV observations, map an ordered canonical funnel, inspect deterministic conversions, and trace every displayed number to its exact import row and source record.

## CSV contract

Required headers are `metric`, `value`, `window_start`, `window_end`, `segment`, `fresh_as_of`, `quality_state`, and `source_note`. Files are UTF-8, comma-delimited, at most 256 KB and 500 data rows. Timestamps use ISO 8601 with a timezone.

Quoted commas, escaped quotes, embedded line breaks, CRLF, and a UTF-8 BOM are supported. Preview validates the entire file and commits nothing when any row is invalid.

## Quality and value invariants

- `current`, `stale`, and `conflicted` require a finite numeric candidate value.
- `missing`, `unknown`, and `invalid` require a blank value.
- A parsed numeric `0` remains an observed zero. A blank cell never becomes zero.
- Conflicting duplicate observations preserve their candidates and surface `conflicted`; they are never averaged or silently selected.
- Import identity derives from the source-file hash plus canonical row identity, so retrying the same import has one effect.

## Metric contract

Each metric versions its name, business definition, unit, aggregation, segment, exclusions, timezone, and freshness threshold. Funnel conversion requires compatible window, segment, and timezone semantics.

## Funnel contract

Founders select and order two to seven canonical stages, provide founder definitions, and map each included stage to one approved metric. Conversion is deterministic `next_stage / previous_stage` only when both observations are current and semantically compatible. Zero denominators, insufficient quality, and incompatible scopes show an explicit unavailable reason.

Manual entry and CSV are the only Sprint 3 sources. Live connections, automated event mapping, diagnosis, and interpolation of absent stages remain out of scope.
