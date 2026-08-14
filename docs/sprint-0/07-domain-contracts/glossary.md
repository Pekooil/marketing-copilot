# Canonical domain glossary

Terms in product copy, code, schemas, analytics, tests, and evaluations must use these meanings. Synonyms may be displayed to founders only when the canonical value remains unambiguous.

| Term | Canonical definition | Not the same as |
|---|---|---|
| Objective | One founder-approved business metric, target, deadline, target segment, baseline state, and rationale that roots recommendations. | A theme, wish, channel target, or task quota. |
| Metric definition | Versioned business meaning, source/query, numerator/denominator, segment, exclusions, window, timezone, owner, and approval state. | A chart label or raw event name. |
| Metric snapshot | One time-bounded computed value or explicit unknown state tied to a metric-definition version and lineage. | A mutable “current value.” |
| Quality state | `current`, `stale`, `missing`, `conflicted`, `invalid`, or `unknown`. | Zero; zero is a valid observed value. |
| Funnel | Founder-approved ordered mapping of product-specific metrics to awareness, acquisition, conversion, activation, retention, revenue, and referral. | A universal benchmark funnel. |
| Activation | The founder-approved first event showing meaningful product value. | Signup, install, page view, or setup unless evidence supports it. |
| Observation | Source-linked statement about what was measured or repeatedly reported, with fact/inference/unknown state. | A causal explanation. |
| Constraint | The single stage/problem currently most likely to limit the active objective, selected with evidence, alternatives, confidence, and reconsideration rule. | The lowest percentage, loudest problem, or permanent company weakness. |
| Constraint candidate | A possible constraint with deterministic impact, reach, tractability, evidence-quality, and urgency factors plus evidence for/against. | The canonical selected constraint. |
| Hypothesis | A falsifiable causal belief linking an observation and constraint to a mechanism and target segment. | A recommendation or prediction stated as fact. |
| Experiment | A versioned, pre-registered intervention designed to test a hypothesis with exposure, outcome, guardrails, minimum evidence, resources, duration, and decision rule. | A task, campaign, or asset without a falsifiable test. |
| Operational task | Necessary work not expected to produce interpretable hypothesis evidence; it must be labeled as such. | An experiment. |
| Exposure | The defined population/event that actually encountered an experiment intervention or comparison. | Eligible traffic or impressions in general. |
| Guardrail | A metric and threshold that limits harm or triggers review/stop. | A secondary success metric. |
| Win | The pre-registered success rule was met without unacceptable guardrail harm. | Any positive movement. |
| Loss | Adequate evidence suggests failure or harm under the approved rule. | A disliked result or execution failure. |
| Inconclusive | Execution was sufficient but evidence cannot separate plausible outcomes. | Invalid tracking or no effort. |
| Invalid | Exposure, instrumentation, protocol, or external event prevents interpretation. | A negative result. |
| Stopped | Guardrail or founder decision ended the experiment early; a reason and evidence are retained. | Silent cancellation. |
| Learning | A scoped conclusion from a valid measurement report with provenance, confidence, applicability, contradiction check, and review state. | Model output, transcript text, or general advice. |
| Growth Memory | Structured temporal records connecting verified facts, definitions, observations, hypotheses, experiments, results, learnings, and decisions. | A transcript vector store. |
| Memory candidate | A proposed fact/learning awaiting verification, validity, scope, and contradiction checks. | Authoritative context. |
| Context snapshot | Immutable, versioned set of objective, constraints, definitions, metrics, active work, relevant memory, permissions, and source references used by a run. | A free-form prompt or live database view. |
| Plan | Versioned, time-bounded allocation of founder time, cash, and agent capacity to at most three compatible experiments. | A backlog or list of suggestions. |
| Allocation | Explicit founder minutes, cash, and agent effort assigned by theme/experiment within caps. | Implied priority. |
| Prepared asset | Reversible draft/brief/copy/spec produced for an approved experiment and not externally executed. | Published/sent/deployed work. |
| Approval | Human decision about an exact artifact/action/version. | A global autonomy setting or permission grant. |
| Permission grant | Scoped authorization for actor, action, target, limits, constraints, time, and revocation. | Approval of a specific version/action. |
| Decision record | Append-only human approve/edit/reject/defer/override/verify/dispute record with reason and target version. | A mutable status field. |
| Evidence link | Typed provenance edge connecting an artifact/claim to source, metric, memory, experiment, or decision. | A free-form citation string alone. |
| Agent run | One bounded capability workflow with immutable inputs, allowed tools, budgets, schema, trace, and terminal status. | A long-lived persona or chat thread. |
| Growth Lead | The single capability accountable for canonical strategy and portfolio synthesis. | A self-authorizing actor or content factory. |
| Specialist | A bounded capability that emits typed proposals/results relevant to a current decision. | An independently reprioritizing agent. |

## Founder-facing language

“Biggest growth bottleneck” may explain `constraint`. “Test” may explain `experiment`. Product interfaces must still preserve canonical types in data, events, audit, and help text.

