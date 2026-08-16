# AI Marketing Copilot

An evidence-backed growth operating system for technical founders. The Sprint 3 manual-metrics and canonical-funnel slice is implemented behind the authenticated workspace boundary.

## Local development

Requirements: Node.js 22+ and pnpm 11.19+.

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

The web app runs at `http://localhost:3000`; the privacy-safe health surface is `GET /api/health`.

Configuration is validated on the server. Never commit `.env.local` or real Supabase credentials.

Planning and decision records remain available in [the documentation index](docs/README.md).

## Current status

- Product baseline: finalized planning source of truth, version 1.0, August 14, 2026.
- Architecture decisions: proposed, not accepted.
- Active delivery phase: Sprint 3 technical gate; live database and founder acceptance pending.
- Application code: secure workspace, verified product context, founder-approved metric contracts, bounded CSV import, source lineage, and deterministic funnel conversions.
- External execution: out of scope for V1.
