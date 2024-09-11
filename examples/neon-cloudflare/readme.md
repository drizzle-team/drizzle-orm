### Example project for [DrizzleORM](https://driz.li/orm) + [Cloudflare Worker](https://workers.cloudflare.com) + [Neon Serverless](https://github.com/neondatabase/serverless)
---


Here's the original [launch blog post](https://blog.cloudflare.com/neon-postgres-database-from-workers/) and official [CF demo repo](https://github.com/neondatabase/serverless-cfworker-demo)

First let's setup your Cloudflare Worker project based on [official docs](https://developers.cloudflare.com/workers/)
```toml
## wrangler.toml

name = "neon-cf-demo"
main = "src/index.ts"
compatibility_date = "2022-12-09"
usage_model = "unbound"
node_compat = true
```

Setup Neon Serverless database - [official docs](https://neon.tech/docs/get-started-with-neon/signing-up), grab database url with project tag, put them in `.dev.vars`. You will need project name for `postgres.js` driver to run migrations - [read here](https://neon.tech/docs/guides/node)
```env
DATABASE_URL=postgres://user:password@localhost:5432/dbname
PROJECT_NAME=shiny-fire-338756
```

now we can run the project!
```bash
npm i

## run locally
npm start

## generate SQL migrations for schema.ts
npm run generate

## apply migrations to remote database
npm run migrate
```

That's it! Subscribe to our [Twitter](https://twitter.com/DrizzleOrm) and join our [community on Discord](http://driz.li/discord) 🚀




