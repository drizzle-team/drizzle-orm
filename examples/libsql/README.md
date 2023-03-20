Example project for [Drizzle ORM libSQL SQLite package](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/sqlite-core)
Subscribe to our updates on [Twitter](https://twitter.com/DrizzleOrm)!

## Initial project setup

All libSQL drivers work with a local file or an http connection string.

to use a local file, with no extra setup:

```sh
LIBSQL_CONNECTION_STRING=file:database.db
```

to use a local libSQL server:

```
$ brew tap libsql/sqld
$ brew install sqld-beta
$ sqld
```

And then:

```sh
LIBSQL_CONNECTION_STRING=http://localhost:8080
```

For ChiselStrike Turso, consult [their homepage and setup guide](https://turso.tech)


To run the example locally:

```bash
npm run lnk
npm run example
```
