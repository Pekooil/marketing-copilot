# Candidate tracker and disposition rules

Use one row per person. Store contact details only in an approved system; this planning repository should contain test IDs, not real personal data.

## Tracker fields

| Field | Allowed values / notes |
|---|---|
| Candidate ID | Opaque study ID, e.g. `P0-C001` |
| Recruitment source | Warm referral, community opt-in, existing research opt-in, other approved source |
| Product type | B2B SaaS, prosumer/app, extension, developer tool, AI software, other |
| Business stage | Pre-revenue, $1–$1K, $1K–$5K, $5K–$20K, out-of-band, undisclosed |
| Analytics platform | PostHog, GA4, Mixpanel, Amplitude, manual/database, none, other |
| Funnel maturity | Defined/tracked, defined/partial, uncertain, absent |
| Weekly growth time | <2h, 2–5h, 6–10h, >10h |
| Screener disposition | Qualify, manual review, exclude |
| Disposition reason | Controlled reason plus optional minimal note |
| Contact state | Not contacted, invited, responded, scheduled, declined, opted out |
| Consent state | Not requested, sent, accepted, declined, withdrawn |
| Onboarding state | Not scheduled, scheduled, completed, incomplete |
| Loop 1 / Loop 2 | Not started, completed, missed, withdrawn |
| Experiment state | Proposed, approved, launched, not launched, concluded |
| WTP interview complete | Yes/no |
| Data restrictions | Minimal description; no secrets |
| Last contact / next action | Date plus approved action |
| Owner | Named study operator |

## Disposition reasons

Use one primary reason:

- `qualified`;
- `not_decision_owner`;
- `product_not_live`;
- `non_icp_business_model`;
- `mature_growth_team`;
- `no_shareable_evidence`;
- `cadence_unavailable`;
- `unsafe_tactic_expectation`;
- `duplicate`;
- `withdrew`;
- `other_reviewed`.

## Privacy and contact controls

- Do not commit real names, emails, URLs, or company-confidential notes to Git.
- Record consent before using interview notes in evaluation fixtures.
- Honor opt-out immediately and maintain suppression in the authorized contact system.
- Separate research identity/contact information from de-identified study evidence.
- Delete or anonymize candidate data according to the agreed study retention period.
- Recruitment volume is never a success metric; completed learning loops and decision usefulness are.

## Blank tracking table

| Candidate ID | Source | Product | Stage | Analytics | Funnel | Disposition | Contact | Consent | Onboarding | Loop 1 | Loop 2 | Experiment | Owner |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P0-C001 |  |  |  |  |  |  |  |  |  |  |  |  |  |

