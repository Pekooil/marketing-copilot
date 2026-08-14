# Founder analytics-platform instrument

Ask during screener/onboarding and verify through a safe demo or documentation where possible.

## Platform and usage

1. Which source do you trust most for product behavior?
2. Which sources are installed but not trusted?
3. Which plan/hosting region or self-hosted variant do you use?
4. Who can authorize a read-only connection?
5. Are canonical signup, activation, retention, and payment events present?
6. How frequently are event names/properties changed?
7. Do you already maintain saved funnels, insights, endpoints, or exports?
8. Which identifiers or properties must never leave the source?
9. Could weekly aggregate counts be entered manually for the study?
10. What made analytics setup hard enough that you might abandon onboarding?

## Record per participant

| Field | Value |
|---|---|
| Platform(s) | PostHog / GA4 / Mixpanel / Amplitude / database / manual / none / other |
| Trusted primary source |  |
| Region/hosting |  |
| Funnel events complete | yes / partial / no / unknown |
| Activation tracked | yes / unreliable / no / unknown |
| Read-only auth feasible | yes / needs admin / no / unknown |
| Aggregate query/export feasible | yes / no / unknown |
| Manual fallback acceptable | yes / temporary / no |
| Setup minutes estimate |  |
| Data sensitivity restrictions |  |
| Connection priority rating (1–5) |  |

## Evidence quality

- `observed`: operator saw the platform/project configuration with permission.
- `founder_reported`: founder stated it but it was not independently inspected.
- `inferred`: inferred from scripts/pages; never count as installed prevalence.
- `unknown`: no evidence.

Report denominators and missing responses; never present a tiny convenience sample as market prevalence.

