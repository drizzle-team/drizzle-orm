## Caching with Drizzle

By default, Drizzle does not perform any implicit actions with your queries and mapping. There is no cache under the hood—each query is sent directly to your database, and you can actually see it.

However, there are cases when you might want to implement a simple caching logic for specific queries or even for all queries. With Drizzle's cache option, you can define how and when the cache is used, how you store and retrieve data, and what actions to take when write statements are executed on the database. It's basically similar to `beforeQuery` hooks, that will be invoked before actual query will be executed. Additionally, Drizzle provides predefined logic for caching. Let's take a look at it.

To make cache work you would need to define cache callbacks in drizzle instance or use a predefined ones we have in Drizzle, like a `upstashCache()` that was built together with Upstash team

### Cache overview

**Using upstash cache with drizzle**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache() })
```

You can also define custom logic for your cache behavior. This is an example of our NodeKV implementation for the Drizzle cache test suites

```ts
const db = drizzle(process.env.DB_URL!, { cache: new TestGlobalCache() })
```

```ts
import Keyv from 'keyv';

export class TestGlobalCache extends Cache {
  private globalTtl: number = 1000;
  // This object will be used to store which query keys were used
  // for a specific table, so we can later use it for invalidation.
  private usedTablesPerKey: Record<string, string[]> = {};

  constructor(private kv: Keyv = new Keyv()) {
    super();
  }

  // For the strategy, we have two options:
  // - 'explicit': The cache is used only when .$withCache() is added to a query.
  // - 'all': All queries are cached globally.
  // The default behavior is 'explicit'.
  override strategy(): 'explicit' | 'all' {
    return 'all';
  }

  // This function accepts query and parameters that cached into key param,
  // allowing you to retrieve response values for this query from the cache.
  override async get(key: string): Promise<any[] | undefined> {
    const res = await this.kv.get(key) ?? undefined;
    return res;
  }

  // This function accepts several options to define how cached data will be stored:
  // - 'key': A hashed query and parameters.
  // - 'response': An array of values returned by Drizzle from the database.
  // - 'tables': An array of tables involved in the select queries. This information is needed for cache invalidation.
  //
  // For example, if a query uses the "users" and "posts" tables, you can store this information. Later, when the app executes
  // any mutation statements on these tables, you can remove the corresponding key from the cache. 
  // If you're okay with eventual consistency for your queries, you can skip this option.
  override async put(key: string, response: any, tables: string[], config?: CacheConfig): Promise<void> {
    await this.kv.set(key, response, config ? config.ex : this.globalTtl);
    for (const table of tables) {
      const keys = this.usedTablesPerKey[table];
      if (keys === undefined) {
        this.usedTablesPerKey[table] = [key];
      } else {
        keys.push(key);
      }
    }
  }

  // This function is called when insert, update, or delete statements are executed. 
  // You can either skip this step or invalidate queries that used the affected tables.
  //
  // The function receives an object with two keys:
  // - 'tags': Used for queries labeled with a specific tag, allowing you to invalidate by that tag.
  // - 'tables': The actual tables affected by the insert, update, or delete statements, 
  //   helping you track which tables have changed since the last cache update.
  override async onMutate(params: { tags: string | string[], tables: string | string[] | Table<any> | Table<any>[]}): Promise<void> {
    const tagsArray = params.tags ? Array.isArray(params.tags) ? params.tags : [params.tags] : [];
    const tablesArray = params.tables ? Array.isArray(params.tables) ? params.tables : [params.tables] : [];

    const keysToDelete = new Set<string>();

    for (const table of tablesArray) {
      const tableName = is(table, Table) ? getTableName(table) : table as string;
      const keys = this.usedTablesPerKey[tableName] ?? [];
      for (const key of keys) keysToDelete.add(key);
    }

    if (keysToDelete.size > 0 || tagsArray.length > 0) {
      for (const tag of tagsArray) {
        await this.kv.delete(tag);
      }

      for (const key of keysToDelete) {
        await this.kv.delete(key);
        for (const table of tablesArray) {
          const tableName = is(table, Table) ? getTableName(table) : table as string;
          this.usedTablesPerKey[tableName] = [];
        }
      }
    }
  }
}
```

### Cache definition

**Define cache credentials, but no cache will be used globally for all queries**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache({ url: '', token: '' }) })
```

**Define cache credentials, and the cache will be used globally for all queries**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache({ url: '', token: '', global: true }) })
```

**Define cache credentials with custom config values to be used for all queries, unless overridden**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache({ url: '', token: '', global: true, config: {} }) })
```

These are all the possible config values that Drizzle supports with the cache layer

```ts
export type CacheConfig = {
  /**
   * expire time, in seconds (a positive integer)
   */
  ex?: number;
  /**
   * expire time, in milliseconds (a positive integer).
   */
  px?: number;
  /**
   * Unix time at which the key will expire, in seconds (a positive integer).
   */
  exat?: number;
  /**
   * Unix time at which the key will expire, in milliseconds (a positive integer)
   */
  pxat?: number;
  /**
   * Retain the time to live associated with the key.
   */
  keepTtl?: boolean;
};

```

### Cache usage

Once you've provided all the necessary instructions to the Drizzle database instance, you can now use the cache with Drizzle

**Case 1: Drizzle with global: false option**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache({ url: '', token: '' }) })
```

In this case, the current query won't use the cache

```ts
const res = await db.select().from(users)

// However, any mutate operation will trigger the onMutate function in the cache
// and attempt to invalidate queries that used the tables involved in this mutation query.
await db.insert(users).value({ email: 'cacheman@upstash.com' })
```

If you want the query to actually use the cache, you need to call `.$withCache()`

```ts
const res = await db.select().from(users).$withCache()
```

`.$withCache` has a set of options you can use to manage and config this specific query strategy

```ts
// rewrite the global config options for this specific query
.$withCache({ config: {} })

// give a query custom cache key instead of hashing query+params under the hood
.$withCache({ tag: 'custom_key' })

// disable autoinvalidation for this query, if you are fine with eventual consstnecy for this specific query
.$withCache({ autoInvalidate: false })
```

**Case 2: Drizzle with global: true option**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache({ url: '', token: '', global: true }) })
```

In this case, the current query will use the cache

```ts
const res = await db.select().from(users)
```

If you want the query to disable cache for some specific query, you need to call `.$withCache(false)`

```ts
// cache is disabled for this query
const res = await db.select().from(users).$withCache(false)
```

You can also use cache instance from a `db` to force invalidate specific tables or tags you've defined previously

```ts
// Invalidate all queries that use the `users` table. You can do this with the Drizzle instance.
await db.$cache?.invalidate({ tables: users });
// or
await db.$cache?.invalidate({ tables: [users, posts] });

// Invalidate all queries that use the `usersTable`. You can do this by using just the table name.
await db.$cache?.invalidate({ tables: 'usersTable' });
// or
await db.$cache?.invalidate({ tables: ['usersTable' , 'postsTable' ] });

// You can also invalidate custom tags defined in any previously executed select queries.
await db.$cache?.invalidate({ tags: 'custom_key' });
// or
await db.$cache?.invalidate({ tags: ['custom_key', 'custom_key1'] });
```
