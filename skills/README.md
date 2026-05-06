# skills/

Project-local skills for AI coding agents (Cursor, Claude Code, etc.).

## Convention

Each skill lives in its own directory under `skills/<skill-name>/`, with the
canonical `SKILL.md` as the source of truth. Tool-specific discovery
locations are **directory symlinks** that point back here:

```
skills/
  refresh-hero-images/
    SKILL.md                                        ← source of truth
.cursor/skills/refresh-hero-images   → ../../skills/refresh-hero-images
.claude/skills/refresh-hero-images   → ../../skills/refresh-hero-images
```

This way one `SKILL.md` powers both Cursor and Claude with no duplication,
and any future supporting files (assets, examples, helper prompts) added
inside the skill directory flow through to both tools automatically.

## Rules

- **Edit `skills/<name>/SKILL.md` directly.** Never edit through the symlink
  — you'll get the same file but the diff is harder to reason about.
- Adding a new skill: `mkdir skills/<name>/`, write `SKILL.md`, then create
  the two symlinks (see the existing one as a template).
- Removing a skill: delete the source directory AND the two symlinks.
- The symlinks are committed; macOS and Linux honour them by default.
  Windows contributors may see a regular file containing the link target —
  acceptable since these skills are maintainer tooling, not runtime code.

## Available skills

- `refresh-hero-images` — refresh the bundled hero-portrait slug map when a
  new champion launches in Idle Champions.
