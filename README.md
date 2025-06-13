<div align="center">
  <img src="./misc/readme/logo-github-sq-dark.svg#gh-dark-mode-only" />
  <img src="./misc/readme/logo-github-sq-light.svg#gh-light-mode-only" />
</div>

<br/>
<div align="center">
  <h3>Headless ORM for NodeJS, TypeScript and JavaScript 🚀</h3>
  <a href="https://orm.drizzle.team">Website</a> •
  <a href="https://orm.drizzle.team/docs/overview">Documentation</a> •
  <a href="https://x.com/drizzleorm">Twitter</a> •
  <a href="https://driz.link/discord">Discord</a>
</div>

<br/>
<br/>

### Replit development

We use `drizzle-kit` for handling database migrations. However in order expose `drizzle-kit`s internal functions (which are not exported by default) they suggested cloning the `drizzle-orm` repo and making our changes just to the one `drizzle-kit/api` file ([see here](./drizzle-kit/src/api.ts)) to build an external API particular for our use case. 

#### Getting started
Run the below in the project root:

```bash
pnpm install && pnpm build
```

#### Development
Navigate to `drizzle-kit` and make any changes you require to the `drizzle-kit/api` file ([see here](./drizzle-kit/src/api.ts)), then run:
```
pnpm build
```
This will build a dist file that you can import into `repl-it-web` using the `file:` protocol in `package.json` like so:
```
"@drizzle-team/drizzle-kit": "file:../drizzle-orm/drizzle-kit/dist",
```
> [!NOTE]
> - After any changes to you'll need to run the build command again.
> - If you're using `drizzle-kit` in pid2 you'll also need to rebuild your pid2 build and re-upload.

#### Publishing changes
Once your changes have been made, bump the package version in `drizzle-kit/package.json`:
```
	"version": "0.31.1",
```
Then build and pack your changes via:
```
pnpm build && pnpm pack
```
This should generate a file ending in `.tgz` in the project root, make sure you rename this file to `package.tgz`, then run:
```
npm run login
npm publish package.tgz --provenance=false
```
> [!NOTE]
> In repl-it-web we scope drizzle packages to our replit-internal npm registry via the @drizzle-team scope, hence we've updated the package name to `@drizzle-team/drizzle-kit` and not just `drizzle-kit`.

### What's Drizzle?
Drizzle is a modern TypeScript ORM developers [wanna use in their next project](https://stateofdb.com/tools/drizzle). 
It is [lightweight](https://bundlephobia.com/package/drizzle-orm) at only ~7.4kb minified+gzipped, and it's tree shakeable with exactly 0 dependencies. 

**Drizzle supports every PostgreSQL, MySQL and SQLite database**, including serverless ones like [Turso](https://orm.drizzle.team/docs/get-started-sqlite#turso), [Neon](https://orm.drizzle.team/docs/get-started-postgresql#neon), [Xata](xata.io), [PlanetScale](https://orm.drizzle.team/docs/get-started-mysql#planetscale), [Cloudflare D1](https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1), [FlyIO LiteFS](https://fly.io/docs/litefs/), [Vercel Postgres](https://orm.drizzle.team/docs/get-started-postgresql#vercel-postgres), [Supabase](https://orm.drizzle.team/docs/get-started-postgresql#supabase) and [AWS Data API](https://orm.drizzle.team/docs/get-started-postgresql#aws-data-api). No bells and whistles, no Rust binaries, no serverless adapters, everything just works out of the box.

**Drizzle is serverless-ready by design**. It works in every major JavaScript runtime like NodeJS, Bun, Deno, Cloudflare Workers, Supabase functions, any Edge runtime, and even in browsers.  
With Drizzle you can be [**fast out of the box**](https://orm.drizzle.team/benchmarks) and save time and costs while never introducing any data proxies into your infrastructure. 

While you can use Drizzle as a JavaScript library, it shines with TypeScript. It lets you [**declare SQL schemas**](https://orm.drizzle.team/docs/sql-schema-declaration) and build both [**relational**](https://orm.drizzle.team/docs/rqb) and [**SQL-like queries**](https://orm.drizzle.team/docs/select), while keeping the balance between type-safety and extensibility for toolmakers to build on top.  

### Ecosystem
While Drizzle ORM remains a thin typed layer on top of SQL, we made a set of tools for people to have best possible developer experience.  
  
Drizzle comes with a powerful [**Drizzle Kit**](https://orm.drizzle.team/kit-docs/overview) CLI companion for you to have hassle-free migrations. It can generate SQL migration files for you or apply schema changes directly to the database.  
  
We also have [**Drizzle Studio**](https://orm.drizzle.team/drizzle-studio/overview) for you to effortlessly browse and manipulate data in your database of choice.

### Documentation
Check out the full documentation on [the website](https://orm.drizzle.team/docs/overview).

### Our sponsors ❤️
<p align="center">
<a href="https://drizzle.team" target="_blank">
<img src='https://api.drizzle.team/v2/sponsors/svg'/>
</a>
</p>
