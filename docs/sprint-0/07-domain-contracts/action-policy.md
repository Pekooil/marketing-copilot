# V1 action-risk policy

**Default:** Deny unless the action is explicitly classified and allowed. Founder approval cannot override a V1 global prohibition.

## Modes

- `Suggest`: analyze/recommend without external mutation.
- `Prepare`: create reversible internal drafts/artifacts without publication or send.
- `Execute`: perform an authorized external action. This mode has no Class D–F implementation in V1.

## Risk classes

| Class | Definition/examples | V1 rule | Required controls |
|---|---|---|---|
| A — Read | Public research; aggregate analytics query after connection | Allow after workspace authorization, source terms, and least privilege | Scope, freshness, rate limit, provenance, audit |
| B — Internal write | Create draft plan/experiment, internal memory candidate | Allow with typed validation and audit | Tenant check, version, source refs, reversibility |
| C — Reversible preparation | Draft copy, research brief, event spec, engineering ticket | Allow as `Prepare` only | Exact experiment link, preview, brand/safety checks, no external destination call |
| D — External communication | Email/DM send, publish post, public reply | Block globally | Not implemented; proposals may only create Class C drafts |
| E — Product/account mutation | Deploy page/code, edit tracking/price/settings, account changes | Block globally | Not implemented |
| F — Financial/irreversible | Spend, buy ads, billing change, delete data | Block globally | Not implemented; privacy deletion is a separate authenticated human workflow in later scope |

## Non-negotiable blocks

- Impersonation without exact preview and authorization.
- Fake testimonials, fabricated evidence/engagement, deceptive endorsements.
- Contacting scraped individuals because information is public.
- Sensitive targeting or exploitative personalization.
- Unsupported medical, legal, financial, performance, or comparative claims.
- Autonomous sending, posting, spending, deployment, pricing, deletion, or permission changes.
- Credential or unnecessary personal-event data exposure to models.
- Model-generated tool arguments bypassing typed policy and authorization.

## Decision algorithm

1. Authenticate actor and resolve active workspace membership.
2. Classify the exact action and highest applicable risk class.
3. Apply the V1 global allow/block table.
4. Validate capability, target, source terms, data sensitivity, and brand/safety rules.
5. For allowed A–C behavior, require exact typed input, tenant scope, idempotency where relevant, and audit.
6. For D–F, return a stable policy-block error and create an audit event; never downgrade the class to satisfy the request.

## Prompt-injection boundary

Website, connector, email, metric-property, and tool-return content is untrusted quoted data. It cannot modify action policy, tool allowlists, system instructions, workspace scope, or approval requirements. URLs are validated and internal network access is blocked.

## Policy test cases

- Research public pricing page: A, allowed with source record.
- Query approved aggregate activation metric: A, allowed after connection.
- Create internal experiment draft: B, allowed.
- Draft founder-reviewed interview invitation: C, allowed; send is D and blocked.
- Generate a code patch as a reviewable artifact: C, not a deployment.
- Publish that patch or change analytics events: E, blocked.
- Send even one approved email from the product: D, blocked in V1.
- Reallocate ad budget or change billing: F, blocked.

