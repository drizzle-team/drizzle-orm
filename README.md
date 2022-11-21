## Drizzle ORM
DrizzleORM is a TypeScript ORM library with a [drizzle-kit](#migrations) CLI companion for automatic SQL migrations generation. 
It's meant to be a library, not a framework, stay as an opt-in solution all the time at any levels. 
We try to follow SQL-like syntax whenever possible, be strongly typed ground top and fail in compile time, not in runtime. 
We implemented best in class `joins` and second to none `migrations generation`. 
Library has almost zero dependencies and being battle tested on production projects by multiple teams 🚀

| database    | support |            |
|:--          |  :---:  | :--        |
| PostgreSQL  | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-pg)|
| MySQL       | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-mysql)|            
| SQLite      | ✅      |[Docs](https://github.com/drizzle-team/drizzle-orm/tree/main/drizzle-orm-sqlite)|  
| DynamoDB    | ⏳      |            |
| MS SQL      | ⏳      |            |
| CockroachDB | ⏳      |            |

### Installation
```bash
// postgresql
npm install drizzle-orm drizzle-orm-pg
npm install -D drizzle-kit

// mysql
npm install drizzle-orm drizzle-orm-mysql
npm install -D drizzle-kit

// sqlite
npm install drizzle-orm drizzle-orm-sqlite
npm install -D drizzle-kit
```
