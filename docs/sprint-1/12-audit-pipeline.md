# S1-012 immutable audit pipeline

Successful mutations append their audit event through the same Drizzle transaction context as the domain write. If audit insertion fails, the transaction rejects and the mutation cannot commit. Authorization denials are recorded separately without executing the domain effect.

Each event includes actor type/ID, workspace, action, target/version, request ID, result, bounded metadata, and timestamp. Metadata keys suggesting tokens, credentials, email, raw payload, or entered content are rejected before insertion.

The database grants audit consumers only `SELECT` and `INSERT`; a trigger rejects every `UPDATE` or `DELETE`. Normal rollback revokes access but never drops the audit table or its history.
