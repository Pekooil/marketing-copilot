# Metric and funnel mapping template

## Metric contract

For each metric record:

- Name and business definition
- Source and source region/account alias
- Query/export/manual method and version
- Numerator and denominator, when applicable
- Segment and exclusions
- Window and timezone
- Freshness timestamp
- Quality state: current, stale, missing, conflicted, invalid, or unknown
- Owner and founder approval state

## Canonical funnel

| Stage | Founder definition | Source event/query/manual input | Segment | Lookback | Quality | Included? | Approval |
|---|---|---|---|---|---|---|---|
| Awareness |  |  |  |  |  | yes/no/unknown |  |
| Acquisition |  |  |  |  |  | yes/no/unknown |  |
| Conversion |  |  |  |  |  | yes/no/unknown |  |
| Activation |  |  |  |  |  | yes/no/unknown |  |
| Retention |  |  |  |  |  | yes/no/unknown |  |
| Revenue |  |  |  |  |  | yes/no/unknown |  |
| Referral |  |  |  |  |  | yes/no/unknown |  |

## Activation interview prompts

1. What first user action indicates meaningful value rather than setup?
2. Which action best predicts retained use or payment, if known?
3. How soon should a qualified user reach it?
4. Is the event tracked consistently across product versions and platforms?
5. Which test/internal/duplicate users must be excluded?
6. What would contradict this activation definition?

## Calculation rules

- Calculate rates only when numerator and denominator share population, segment, timezone, and window semantics.
- Store raw counts alongside rates.
- Never interpolate absent stages.
- Flag denominators too small for safe interpretation.
- Preserve source-specific values when sources conflict; request a resolution rather than choosing silently.

