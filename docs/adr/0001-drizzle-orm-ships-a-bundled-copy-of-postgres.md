# drizzle-orm ships a bundled copy of Drizzle Postgres

`drizzle-orm/postgres` runs on Drizzle Postgres. The `drizzle-orm` package ships a bundled copy of Drizzle Postgres, so that `npm install drizzle-orm` is enough to connect to Postgres. A user who is new to Drizzle then has one install step and does not have to choose a driver before the first query.

The ORM build copies Drizzle Postgres's whole built output from the workspace into the `postgres/client` folder of the published package. The ORM's own modules import Drizzle Postgres through `#postgres` and `#postgres/<subpath>` in the `imports` field of the published manifest. Each entry keeps Drizzle Postgres's export conditions (`workerd`, `deno`, `bun`, `node`), so the runtime picks Drizzle Postgres's transport when it loads the ORM, as it does for the standalone package. A plain bundle would fix the transport at build time, because Drizzle Postgres picks its transport by export condition. `drizzle-orm/postgres/client` and `drizzle-orm/postgres/client/<subpath>` expose the root and each subpath of the bundled copy, so that users can create pools, catch `PgError` and use Drizzle Postgres's types without a second install. `drizzle-orm/postgres` and its runtime entries (`cf`, `deno`, `neon-ws`, `http`, `aurora`) also re-export the matching part of the bundled copy, so the driver and the client come from one path.

The standalone package stays a separate npm package with its own version. A user who needs a Drizzle Postgres fix before the next ORM release installs the standalone package and passes its pool or connection as `client` to `drizzle` from `drizzle-orm/postgres/core`. That entry loads no part of the bundled copy except its geometry codec, its marker functions and its brand check, so the standalone package is the only copy of the client in the bundle and at runtime. Drizzle Postgres's classes carry brands, and its declaration files have no private members, so objects and errors from the two copies work together at runtime and in types.

A regular dependency on `@drizzle-team/postgres` would also give one install step. The ORM would then declare a version range, and a project could get a Drizzle Postgres release that no ORM release was tested against. The bundled copy is the exact Drizzle Postgres code that the ORM was built and tested with. A non-optional peer dependency would keep the second install step for package managers that do not install peers by themselves. Both options also install a second package for every ORM user, including users of other dialects. The bundled copy costs the same bytes, and the package manager has nothing to resolve for it.

## Consequences

- An ORM release bundles the Drizzle Postgres code that is in the workspace at build time.
- Drizzle Postgres is released before an ORM release that changes the bundled copy, so that the bundled version also exists as a standalone package.
- A breaking change in Drizzle Postgres's public API needs an ORM release that bundles the new version.
- The ORM does no runtime version check and shows no warning when the bundled copy and a standalone package differ.
- The bundled copy adds about 560 KB unpacked to every install of `drizzle-orm`.
- The bundled copy is ESM only. The CommonJS output of the `--dual` build loads it through `require()` of ESM, which needs Node 20.19 or newer, or 22.12 or newer.
