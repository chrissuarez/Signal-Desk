# Preferences validated at the write boundary, not via shared types

The frontend (dashboard write side) and backend (ingestion read side) each describe the
user **Preferences** shape independently, and the generic `settings` store passes JSON
through untyped — so the two can silently drift (#16). The backend read path is already
validated (#15); the unguarded edge is the **write**: `POST /settings/:key` stored
whatever arrived.

We considered a **shared types package** (both sides import one `Preferences` type —
strongest guarantee, but requires monorepo/shared-build tooling that does not exist today)
and a **frontend-mirrored zod schema** (cheaper, but two runtime validators skew unless
generation is automated). We chose instead to make the backend's existing `Preferences`
zod schema (#15) the **single source of truth** and validate every `user_preferences`
write at the API boundary, rejecting invalid payloads with a 4xx (fail loud, never store
corrupt config). Validation is keyed per settings key, so other keys (`gmail_tokens`,
`strategic_guardrails`) pass through unchanged.

The frontend keeps a lightweight local TypeScript type for build-time safety (dropping the
`any`-typed write), but carries **no runtime validator** — backend rejection is the
guarantee that any skew fails loud rather than corrupting stored config. We deliberately do
**not** stand up shared-types infrastructure for a single-user app; revisit only if a
genuine third consumer of the shape appears.

We also **dropped `minSalary`** from the `Preferences` contract here. It was a phantom field
— present in the type and zod schema but read by no scoring path and set by no form. An
honest contract carries only what is real, so making this the validated source of truth was
the moment to remove it. The schema strips unknown keys, so any legacy stored `minSalary` is
silently dropped on the next read with no migration. Salary filtering, if ever wanted, is a
separate feature that would add the field back alongside the logic that reads it.
