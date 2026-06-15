# Signal-Desk

## Agent skills

### Issue tracker

Issues and PRDs are tracked as GitHub issues in `chrissuarez/Signal-Desk` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default triage vocabulary — label strings equal their role names. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: one `CONTEXT.md` + `docs/adr/` at the root. See `docs/agents/domain.md`.

### README upkeep

`README.md` is the user-facing run/use guide. Whenever a change adds or alters a setup step,
an environment variable, a dashboard feature, or a command, update the matching `README.md`
section in the same change. Keep concepts/decisions in `CONTEXT.md` + `docs/adr/` and link to
them rather than duplicating.
