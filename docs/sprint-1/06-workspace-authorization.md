# S1-006 workspace authorization service

Workspace access is determined only from a server-resolved identity and an active membership loaded through the repository port.

| Role | Read | Switch | Update workspace | Manage members |
|---|---:|---:|---:|---:|
| Owner | Allow | Allow | Allow | Allow |
| Member | Allow | Allow | Deny | Deny |
| Inactive or absent | Deny | Deny | Deny | Deny |

Missing and forbidden workspace identifiers return the same `WORKSPACE_NOT_FOUND_OR_FORBIDDEN` contract so callers cannot enumerate tenants. Workspace creation atomically assigns the creator as owner. Membership changes are rejected if they would leave no active owner.

Invitation creation and acceptance are intentionally absent from this service until collaboration demand is validated.
