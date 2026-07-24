# Drizzle ORM bounty submission packet (Issue #1083)

Local repo:

- `/Users/mavenai/Desktop/Singaw Sity Labs/Singaw Sity Codex/bounty-work/drizzle-orm-1603`
- Branch: `feat/bounty-1083-customtype-selectfromdb`

Public references:

- GitHub issue: https://github.com/drizzle-team/drizzle-orm/issues/1083
- Algora funding page (sponsor): https://algora.io/Seated/home

## What’s implemented

- Adds `selectFromDb` to `customType(...)` params for all supported dialects.
- Uses `selectFromDb` during query selection generation so custom types can transform values in SQL before driver decoding.
- Adds test: `drizzle-orm/tests/customTypeSelectFromDb.test.ts`.
- Updates docs:
  - `docs/custom-types.lite.md`
  - `docs/custom-types.md`

## How to verify

```bash
cd "/Users/mavenai/Desktop/Singaw Sity Labs/Singaw Sity Codex/bounty-work/drizzle-orm-1603"
npx -y pnpm@10.6.3 -C drizzle-orm test -- --run customTypeSelectFromDb
```

## Suggested PR title

`feat(orm): allow customType selectFromDb SQL transforms`

## Suggested PR body

- Addresses `drizzle-team/drizzle-orm#1083`.
- Adds a new optional `selectFromDb` hook to `customType(...)` that lets custom columns customize how they are selected (useful for types requiring SQL transforms such as PostGIS geometries).
- Includes a unit test and doc updates.

## How to push branch (already safe if credentials are configured)

```bash
cd "/Users/mavenai/Desktop/Singaw Sity Labs/Singaw Sity Codex/bounty-work/drizzle-orm-1603"
git push -u fork feat/bounty-1083-customtype-selectfromdb
```

## How to open the PR (user action)

Open this compare URL (edit if GitHub suggests a different base):

- https://github.com/drizzle-team/drizzle-orm/compare/main...TheDerbiedOne:feat/bounty-1083-customtype-selectfromdb?expand=1

