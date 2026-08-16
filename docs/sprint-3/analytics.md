# Sprint 3 analytics contract

Sprint 3 extends the provider-neutral analytics schema with `metric_definition_saved`, `manual_metrics_previewed`, `manual_metrics_imported`, and `funnel_saved`. Events contain only bounded categories, counts, version buckets, units, aggregations, and quality-state names.

Metric names, definitions, segment text, exclusions, filenames, source notes, values, windows, source identifiers, evidence identifiers, and raw CSV content are forbidden by strict schemas. `safe_error` accepts the `metrics` area but only an uppercase error class.

As in earlier sprints, the schema and consent-aware client are implemented without selecting or credentialing a production analytics vendor.
