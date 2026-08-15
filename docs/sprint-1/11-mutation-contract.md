# S1-011 authenticated mutation and error contract

Every mutation carries a UUID request ID, resolved workspace ID, idempotency key, and optional expected version. Authorization runs before any domain effect. The idempotency scope is `(workspace_id, key)` and includes a canonical request hash, so a true retry reuses the first result while reuse for another payload is rejected.

Concurrent duplicate calls share one in-flight effect. Failed effects release their in-memory claim for a safe retry; the PostgreSQL receipt records only hashes, action/result references, status, and correlation IDs—not request payloads.

Public errors distinguish authentication, unavailable/forbidden resources, validation, optimistic conflict, idempotency conflict, and internal failure without exposing tenant existence or stack details. Every response includes its request ID.
