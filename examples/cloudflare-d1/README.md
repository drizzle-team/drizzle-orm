Example project for [Drizzle ORM D1 SQLite package](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm/src/sqlite-core)
Subscribe to our updates on [Twitter](https://twitter.com/DrizzleOrm)!

## Initial project setup

To setup project for your Cloudflare D1 - please refer to [official docs](https://developers.cloudflare.com/d1/)

```toml
## your wrangler.toml will look something like this

name = "YOU PROJECT NAME"
main = "src/index.ts"
compatibility_date = "2022-11-07"
node_compat = true

[[ d1_databases ]]
binding = "DB"
database_name = "YOU DB NAME"
database_id = "YOUR DB ID"
```

To init local database and run server locally

```bash
wrangler d1 execute <DATABASE_NAME> --local --file=./drizzle/20221126113135/migration.sql
wrangler dev --local --persist
```

Install Drizzle ORM

```bash
npm install drizzle-orm
```

To automatically generate migration .sql files, when src/schema.ts chages
```bash
npm install drizzle-kit

## package.json
{
  ...
  scripts: {
    "generate": "drizzle-kit generate --schema=src/schema.ts dialect=sqlite"
  }
}

npm run generate
```
