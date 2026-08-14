# Connector decision framework

## Decision options

1. PostHog read-only first.
2. GA4 or Mixpanel first if beachhead evidence materially exceeds PostHog.
3. Manual/CSV-only V1 until a supported connector path is validated.

## Weighted score

Score each candidate from 0–5, multiply by weight, and show raw evidence.

| Criterion | Weight | Question |
|---|---:|---|
| Qualified-founder prevalence | 25% | How many usable pilot founders rely on it? |
| Activation/retention usefulness | 20% | Can it express the short product funnel correctly? |
| Supported least-privilege access | 15% | Is there a documented read-only auth/data path for a third-party app? |
| Setup completion | 10% | Can a founder connect and confirm mappings without high abandonment? |
| Aggregate/privacy fit | 10% | Can V1 avoid retaining raw identifying events? |
| Reliability/idempotency | 10% | Are checkpoints, rate limits, backfills, and versioning tractable? |
| Maintenance/region coverage | 5% | US/EU/self-hosted and API stability burden? |
| Willingness-to-pay dependence | 5% | Does live connection materially change purchase intent? |

## Minimum gates independent of score

- Documented or provider-confirmed supported use.
- Least-privilege authentication and revocation.
- Source lineage and zero/unknown distinction.
- No credentials or unnecessary personal event data in model context.
- Failure can mark metrics stale/conflicted and fall back to manual input.
- Contract fixtures cover partial, duplicate, expired, remapped, and regional cases.

If any minimum gate fails, the connector cannot ship even if prevalence is high.

## Sample-size caution

The 8–12 founder cohort is directional product validation. Report counts such as “4 of 9 usable participants,” not market-share percentages. Revalidate after private-beta recruitment.

