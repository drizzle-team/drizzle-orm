<div align="center">
<h1>Drizzle ORM <a href=""><img alt="npm" src="https://img.shields.io/npm/v/drizzle-orm?label="></a></h1>
<img alt="npm" src="https://img.shields.io/npm/dm/drizzle-orm">
<img alt="npm bundle size" src="https://img.shields.io/bundlephobia/min/drizzle-orm">
<a href="https://discord.gg/yfjTbVXMW4"><img alt="Discord" src="https://img.shields.io/discord/1043890932593987624"></a>
<img alt="License" src="https://img.shields.io/npm/l/drizzle-orm">
<h6><i>If you know SQL, you know Drizzle ORM</i></h6>
<hr />
</div>

Drizzle ORM is a TypeScript ORM for SQL databases designed with maximum type safety in mind. It comes with a [drizzle-kit](https://github.com/drizzle-team/drizzle-kit-mirror) CLI companion for automatic SQL migrations generation. Drizzle ORM is meant to be a library, not a framework. It stays as an opt-in solution all the time at any levels.

The ORM main philosophy is "If you know SQL, you know Drizzle ORM". We follow the SQL-like syntax whenever possible, are strongly typed ground top and fail at compile time, not in runtime.

Drizzle ORM is being battle-tested on production projects by multiple teams 🚀 Give it a try and let us know if you have any questions or feedback on [Discord](https://discord.gg/yfjTbVXMW4).

### Feature list

- Full type safety
- [Smart automated migrations generation](https://github.com/drizzle-team/drizzle-kit-mirror)
- No ORM learning curve
- SQL-like syntax for table definitions and queries
- Best in class fully typed joins
- Fully typed partial and non-partial selects of any complexity
- Auto-inferring of TS types for DB models for selections and insertions separately
- Zero dependencies

| Database    | Support | |
|:------------|:-------:|:---|
| PostgreSQL  | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-pg)|
| MySQL       | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-mysql)|
| SQLite      | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-sqlite)|
| DynamoDB    | ⏳      |            |
| MS SQL      | ⏳      |            |
| CockroachDB | ⏳      |            |

### Installation

```bash
# postgresql
npm install drizzle-orm drizzle-orm-pg
npm install -D drizzle-kit

# mysql
npm install drizzle-orm drizzle-orm-mysql
npm install -D drizzle-kit

# sqlite
npm install drizzle-orm drizzle-orm-sqlite
npm install -D drizzle-kit
```
