# Publish as `@drizzle-team/minipg`

The unscoped `minipg` name on npm is taken. GitHub Packages and git URLs both need a token or extra setup on the consumer side, which internal consumers should not have to do. The package is therefore published to npm under the `@drizzle-team` scope. The first scoped release kept version `0.3.1`, so that drizzle-pulse could switch with a source change only.
