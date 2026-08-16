# Sprint 1 — secure workspace foundation

**Status:** Technical implementation and live infrastructure gate complete; founder field validation deferred by founder decision
**Authorization date:** August 15, 2026  
**Plan:** [Conditional ticket plan](../planning/sprint-1-gate.md)

## Decision context

The founder explicitly authorized Sprint 1 before real Sprint 0 field validation. This is a deliberate gate override, not evidence that the Sprint 0 validation criteria passed. The missing evidence remains documented in [Sprint 0 status](../sprint-0/status-and-gate.md).

## Approved implementation defaults

- pnpm workspace/package manager
- Next.js App Router with TypeScript and Tailwind CSS
- Supabase Auth and PostgreSQL on the dedicated `marketing-copilot` gate project (`qeoqhunqsjfxpwgliixq`)
- Drizzle for application schema and type-safe queries
- Vercel web runtime at `https://marketing-copilot-chi.vercel.app` with environment-scoped Supabase configuration
- Invitations excluded until collaboration demand is validated
- Class D–F external actions globally blocked
- One commit and push per Sprint 1 ticket

## Ticket status

| Ticket | Outcome | Status |
|---|---|---|
| S1-001 | Contracts and threat model ratified | Complete |
| S1-002 | Application shell and environment contract | Complete |
| S1-003 | CI quality and migration gates | Complete |
| S1-004 | Identity/tenancy migration | Complete; empty, prior-schema, and down/forward rehearsal passed live |
| S1-005 | Auth and session adapter | Complete |
| S1-006 | Workspace authorization service | Complete |
| S1-007 | RLS and grants | Complete; raw authenticated, anonymous, and worker-scope matrix passed live |
| S1-008 | Versioned Company Profile | Complete |
| S1-009 | Objective domain | Complete |
| S1-010 | Resource/policy constraints | Complete |
| S1-011 | Mutation and error contract | Complete |
| S1-012 | Immutable audit pipeline | Complete |
| S1-013 | Onboarding UI | Complete; authenticated server persistence passed on the live gate project |
| S1-014 | Feature flags and observability | Complete |
| S1-015 | Product analytics | Complete |
| S1-016 | Release/isolation suite | Complete; local release suite plus 14 live database scenarios passed |
| S1-017 | Support trace, runbook, rollback, demo | Complete; infrastructure rehearsal passed, founder field demo deferred |
