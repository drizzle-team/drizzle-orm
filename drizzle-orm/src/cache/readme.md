## Caching with Drizzle

By default, Drizzle does not perform any implicit actions with your queries and mapping. There is no cache under the hood—each query is sent directly to your database, and you can actually see it.

However, there are cases when you might want to implement a simple caching logic for specific queries or even for all queries. With Drizzle's cache option, you can define how and when the cache is used, how you store and retrieve data, and what actions to take when write statements are executed on the database. It's basically similar to `beforeQuery` hooks, that will be invoked before actual query will be executed. Additionally, Drizzle provides predefined logic for caching. Let's take a look at it.

To make cache work you would need to define cache callbacks in drizzle instance or use a predefined ones we have in Drizzle, like a `upstashCache()` that was built together with Upstash team

### Cache overview

**Using upstash cache with drizzle**

```ts
const db = drizzle(process.env.DB_URL!, { cache: upstashCache() });
```

You can also define custom logic for your cache behavior. This is an example of our NodeKV implementation for the Drizzle cache test suites

```ts
const db = drizzle(process.env.DB_URL!, { cache: new TestGlobalCache() });
```

```ts
import Keyv from "keyv";

export class TestGlobalCache extends Cache {
  private globalTtl: number = 1000;
  private usedTablesPerKey: Record<string, string[]> = {};

  constructor(private kv: Keyv = new Keyv()) {
    super();
  }

  override strategy(): "explicit" | "all" {
    return "all";
  }

  override async get(
    key: string,
    tables: string[],
    isTag: boolean,
    isAutoInvalidate?: boolean
  ): Promise<any[] | undefined> {
    const res = (await this.kv.get(key)) ?? undefined;
    return res;
  }

  override async put(
    hashedQuery: string,
    response: any,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig
  ): Promise<void> {
    await this.kv.set(
      hashedQuery,
      response,
      config ? config.ex : this.globalTtl
    );

    if (isTag) {
    }

    for (const table of tables) {
      const keys = this.usedTablesPerKey[table];
      if (keys === undefined) {
        this.usedTablesPerKey[table] = [hashedQuery];
      } else {
        keys.push(hashedQuery);
      }
    }
  }

  override async onMutate(params: {
    tags: string | string[];
    tables: string | string[] | Table<any> | Table<any>[];
  }): Promise<void> {
    const tagsArray = params.tags
      ? Array.isArray(params.tags)
        ? params.tags
        : [params.tags]
      : [];
    const tablesArray = params.tables
      ? Array.isArray(params.tables)
        ? params.tables
        : [params.tables]
      : [];

    const keysToDelete = new Set<string>();

    for (const table of tablesArray) {
      const tableName = is(table, Table)
        ? getTableName(table)
        : (table as string);
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
          const tableName = is(table, Table)
            ? getTableName(table)
            : (table as string);
          this.usedTablesPerKey[tableName] = [];
        }
      }
    }
  }
}
```

### Understanding Cache Entry Types

When implementing a custom cache, it's important to understand the difference between regular cache entries and tag-based cache entries:

#### Regular Cache Entries (`isTag: false`)

- These are created from regular queries like `db.select().from(users)`
- They use hashed query + parameters as the cache key
- They can be invalidated when tables are mutated (if `autoInvalidate` is enabled)

#### Tag-based Cache Entries (`isTag: true`)

- These are created when you use custom tags with `.$withCache({ tag: 'custom_key' })`
- They allow you to invalidate specific cache entries by tag name
- They're useful for caching complex queries or API responses that don't directly map to table mutations

#### Implementing Tag Support

For a more complete implementation that properly handles tags, consider this enhanced version:

```ts
export class AdvancedTestGlobalCache extends Cache {
  private globalTtl: number = 1000;
  private usedTablesPerKey: Record<string, string[]> = {};
  private tagToKey: Record<string, string> = {};

  constructor(private kv: Keyv = new Keyv()) {
    super();
  }

  override strategy(): "explicit" | "all" {
    return "all";
  }

  override async get(
    key: string,
    tables: string[],
    isTag: boolean,
    isAutoInvalidate?: boolean
  ): Promise<any[] | undefined> {
    if (isTag) {
      const actualKey = this.tagToKey[key];
      if (!actualKey) return undefined;
      return (await this.kv.get(actualKey)) ?? undefined;
    }

    return (await this.kv.get(key)) ?? undefined;
  }

  override async put(
    hashedQuery: string,
    response: any,
    tables: string[],
    isTag: boolean,
    config?: CacheConfig
  ): Promise<void> {
    const cacheKey = isTag ? `tag_${hashedQuery}` : hashedQuery;

    await this.kv.set(cacheKey, response, config ? config.ex : this.globalTtl);

    if (isTag) {
      this.tagToKey[hashedQuery] = cacheKey;
    }
    for (const table of tables) {
      const keys = this.usedTablesPerKey[table];
      if (keys === undefined) {
        this.usedTablesPerKey[table] = [cacheKey];
      } else {
        keys.push(cacheKey);
      }
    }
  }

  override async onMutate(params: {
    tags: string | string[];
    tables: string | string[] | Table<any> | Table<any>[];
  }): Promise<void> {
    const tagsArray = params.tags
      ? Array.isArray(params.tags)
        ? params.tags
        : [params.tags]
      : [];
    const tablesArray = params.tables
      ? Array.isArray(params.tables)
        ? params.tables
        : [params.tables]
      : [];

    const keysToDelete = new Set<string>();

    for (const tag of tagsArray) {
      const cacheKey = this.tagToKey[tag];
      if (cacheKey) {
        keysToDelete.add(cacheKey);
        delete this.tagToKey[tag];
      }
    }

    for (const table of tablesArray) {
      const tableName = is(table, Table)
        ? getTableName(table)
        : (table as string);
      const keys = this.usedTablesPerKey[tableName] ?? [];
      for (const key of keys) keysToDelete.add(key);
    }

    for (const key of keysToDelete) {
      await this.kv.delete(key);
    }
  }
}
```

This advanced implementation:

- Stores tag-based entries with a `tag_` prefix to distinguish them
- Maintains a mapping from tag names to cache keys
- Properly handles both tag-based and table-based invalidation
- Demonstrates how to extend the simple example for production use

### Cache definition

**Define cache credentials, but no cache will be used globally for all queries**

```ts
const db = drizzle(process.env.DB_URL!, {
  cache: upstashCache({ url: "", token: "" }),
});
```

**Define cache credentials, and the cache will be used globally for all queries**

```ts
const db = drizzle(process.env.DB_URL!, {
  cache: upstashCache({ url: "", token: "", global: true }),
});
```

**Define cache credentials with custom config values to be used for all queries, unless overridden**

```ts
const db = drizzle(process.env.DB_URL!, {
  cache: upstashCache({ url: "", token: "", global: true, config: {} }),
});
```

These are all the possible config values that Drizzle supports with the cache layer

```ts
export type CacheConfig = {
  ex?: number;
  px?: number;
  exat?: number;
  pxat?: number;
  keepTtl?: boolean;
};
```

### Cache usage

Once you've provided all the necessary instructions to the Drizzle database instance, you can now use the cache with Drizzle

**Case 1: Drizzle with global: false option**

```ts
const db = drizzle(process.env.DB_URL!, {
  cache: upstashCache({ url: "", token: "" }),
});
```

In this case, the current query won't use the cache

```ts
const res = await db.select().from(users);

await db.insert(users).value({ email: "cacheman@upstash.com" });
```

If you want the query to actually use the cache, you need to call `.$withCache()`

```ts
const res = await db.select().from(users).$withCache();
```

`.$withCache` has a set of options you can use to manage and config this specific query strategy

```ts
.$withCache({ config: {} })

.$withCache({ tag: 'custom_key' })

.$withCache({ autoInvalidate: false })
```

**Case 2: Drizzle with global: true option**

```ts
const db = drizzle(process.env.DB_URL!, {
  cache: upstashCache({ url: "", token: "", global: true }),
});
```

In this case, the current query will use the cache

```ts
const res = await db.select().from(users);
```

If you want the query to disable cache for some specific query, you need to call `.$withCache(false)`

```ts
const res = await db.select().from(users).$withCache(false);
```

You can also use cache instance from a `db` to force invalidate specific tables or tags you've defined previously

```ts
await db.$cache?.invalidate({ tables: users });
await db.$cache?.invalidate({ tables: [users, posts] });

await db.$cache?.invalidate({ tables: "usersTable" });
await db.$cache?.invalidate({ tables: ["usersTable", "postsTable"] });

await db.$cache?.invalidate({ tags: "custom_key" });
await db.$cache?.invalidate({ tags: ["custom_key", "custom_key1"] });
```
