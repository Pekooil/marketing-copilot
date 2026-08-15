# Sprint 1 — secure workspace foundation

**Status:** Authorized for implementation  
**Authorization date:** August 15, 2026  
**Plan:** [Conditional ticket plan](../planning/sprint-1-gate.md)

## Decision context

The founder explicitly authorized Sprint 1 before real Sprint 0 field validation. This is a deliberate gate override, not evidence that the Sprint 0 validation criteria passed. The missing evidence remains documented in [Sprint 0 status](../sprint-0/status-and-gate.md).

## Approved implementation defaults

- pnpm workspace/package manager
- Next.js App Router with TypeScript and Tailwind CSS
- Supabase Auth and PostgreSQL, developed against local/test configuration
- Drizzle for application schema and type-safe queries
- Vercel-compatible web runtime; production Supabase/Vercel credentials deferred
- Invitations excluded until collaboration demand is validated
- Class D–F external actions globally blocked
- One commit and push per Sprint 1 ticket

## Ticket status

| Ticket | Outcome | Status |
|---|---|---|
| S1-001 | Contracts and threat model ratified | Complete |
| S1-002 | Application shell and environment contract | Complete |
| S1-003 | CI quality and migration gates | Complete |
| S1-004 | Identity/tenancy migration | Implemented; DB rehearsal pending runtime |
| S1-005 | Auth and session adapter | Pending |
| S1-006 | Workspace authorization service | Pending |
| S1-007 | RLS and grants | Pending |
| S1-008 | Versioned Company Profile | Pending |
| S1-009 | Objective domain | Pending |
| S1-010 | Resource/policy constraints | Pending |
| S1-011 | Mutation and error contract | Pending |
| S1-012 | Immutable audit pipeline | Pending |
| S1-013 | Onboarding UI | Pending |
| S1-014 | Feature flags and observability | Pending |
| S1-015 | Product analytics | Pending |
| S1-016 | Release/isolation suite | Pending |
| S1-017 | Support trace, runbook, rollback, demo | Pending |
