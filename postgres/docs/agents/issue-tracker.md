# Issue tracker: Beads

Issues and specs for this repo live in Beads (`bd`), a local Dolt database under `.beads/`.
The database is excluded from git through `.git/info/exclude`, so the issues stay on the
machine that created them. Run `bd prime` for the full command reference.

## Conventions

- **Create an issue**: `bd create --title "..." --description "..." --type task|bug|feature|epic|decision|spike --priority 2`. Use `--body-file -` with a heredoc for long bodies.
- **Read an issue**: `bd show <id>` (includes dependencies and comments).
- **List issues**: `bd list --status open`, `bd ready` (open and unblocked), `bd search <query>`.
- **Comment on an issue**: `bd comment <id> "..."`, or `--stdin` for long text.
- **Apply / remove labels**: `bd update <id> --add-label "..."` / `--remove-label "..."`, or `bd label add <id> <label>`.
- **Close**: `bd close <id> --reason "..."`.
- **Backlog**: put an item on the backlog with `bd defer <id>`, so that its status is `deferred`. Priority states urgency only. Do not use P4 or another low priority to mean "backlog". `bd undefer <id>` brings an item back.
- Never run `bd edit`: it opens an interactive editor.
- Do not run `bd dolt push` or any other remote sync unless the user asks for it.

## When a skill says "publish to the issue tracker"

Create a Beads issue with `bd create`. A spec is an issue of type `epic`. The tickets that
implement it are children: `bd create ... --parent <epic-id>`.

## When a skill says "fetch the relevant ticket"

Run `bd show <id>`.

## Blocking edges

`bd dep add <blocked-id> <blocker-id>` records that the first issue waits for the second.
`bd ready` lists only the issues whose blockers are all closed. `bd blocked` lists the rest.

## Wayfinding operations

Used by `/wayfinder`. The **map** is an epic with one **child** issue per ticket.

- **Map**: `bd create --type epic --labels wayfinder:map`, holding the Notes / Decisions-so-far / Fog body in the description.
- **Child ticket**: `bd create --parent <map-id> --labels wayfinder:<type>`, where the type is `research`, `prototype`, `grilling` or `task`. The question goes in the description.
- **Blocking**: `bd dep add <child> <blocker>`. A ticket is unblocked when every blocker is closed.
- **Frontier**: `bd ready`, filtered to the map's children and to unassigned issues. The first one in creation order wins.
- **Claim**: `bd update <id> --claim`, the session's first write.
- **Resolve**: `bd comment <id>` with the answer, then `bd close <id>`, then append a context pointer (gist and issue id) to the Decisions-so-far section of the map with `bd update <map-id> --description`.
