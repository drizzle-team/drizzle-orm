<div align="center">
  <img src="./misc/readme/logo-github-sq-dark.svg#gh-dark-mode-only" />
  <img src="./misc/readme/logo-github-sq-light.svg#gh-light-mode-only" />
</div>

<br/>
<div align="center">
  <h3>NodeJS、TypeScript 和 JavaScript 的无头 ORM 🚀</h3>
  <a href="https://orm.drizzle.team">网站</a> •
  <a href="https://orm.drizzle.team/docs/overview">文档</a> •
  <a href="https://x.com/drizzleorm">Twitter</a> •
  <a href="https://driz.link/discord">Discord</a>
</div>

<br/>
<br/>

### 什么是 Drizzle？

Drizzle 是一个现代 TypeScript ORM，开发者[想在他们的下一个项目中使用](https://stateofdb.com/tools/drizzle)。它[轻量级](https://bundlephobia.com/package/drizzle-orm)，只有约 7.4kb（压缩+gzip），并且完全支持 tree-shaking，0 依赖。

**Drizzle 支持所有 PostgreSQL、MySQL 和 SQLite 数据库**，包括无服务器数据库，如 [Turso](https://orm.drizzle.team/docs/get-started-sqlite#turso)、[Neon](https://orm.drizzle.team/docs/get-started-postgresql#neon)、[Xata](https://orm.drizzle.team/docs/connect-xata)、[PlanetScale](https://orm.drizzle.team/docs/get-started-mysql#planetscale)、[Cloudflare D1](https://orm.drizzle.team/docs/get-started-sqlite#cloudflare-d1)、[FlyIO LiteFS](https://fly.io/docs/litefs/)、[Vercel Postgres](https://orm.drizzle.team/docs/get-started-postgresql#vercel-postgres)、[Supabase](https://orm.drizzle.team/docs/get-started-postgresql#supabase) 和 [AWS Data API](https://orm.drizzle.team/docs/get-started-postgresql#aws-data-api)。

## 特性

- 🎯 **TypeScript 优先**：完整的类型推断
- 🪶 **轻量级**：只有约 7.4kb（压缩+gzip）
- 🔒 **类型安全**：端到端类型安全
- 🚀 **高性能**：优化的查询生成
- 📦 **零依赖**：没有任何外部依赖
- 🎨 **SQL-like API**：直观的 SQL-like 查询构建器
- 🔄 **自动迁移**：自动生成和运行迁移
- 📊 **可视化工具**：Drizzle Studio 可视化数据库

## 安装

```bash
npm install drizzle-orm
npm install -D drizzle-kit
```

## 快速开始

### 定义 Schema

```typescript
import { pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
  email: varchar('email', { length: 256 }),
});
```

### 连接数据库

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);
```

### 查询数据

```typescript
// 获取所有用户
const allUsers = await db.select().from(users);

// 获取特定用户
const user = await db.select().from(users).where(eq(users.id, 1));

// 插入数据
await db.insert(users).values({
  name: 'John',
  email: 'john@example.com',
});

// 更新数据
await db.update(users)
  .set({ name: 'Jane' })
  .where(eq(users.id, 1));

// 删除数据
await db.delete(users).where(eq(users.id, 1));
```

## 支持的数据库

### PostgreSQL

```typescript
import { pgTable, serial, text } from 'drizzle-orm/pg-core';

const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name'),
});
```

### MySQL

```typescript
import { mysqlTable, int, varchar } from 'drizzle-orm/mysql-core';

const users = mysqlTable('users', {
  id: int('id').primaryKey().autoincrement(),
  name: varchar('name', { length: 256 }),
});
```

### SQLite

```typescript
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
});
```

## 关系

### 一对一

```typescript
import { relations } from 'drizzle-orm';

export const usersRelations = relations(users, ({ one }) => ({
  profile: one(profiles),
}));

export const profilesRelations = relations(profiles, ({ one }) => ({
  user: one(users, {
    fields: [profiles.userId],
    references: [users.id],
  }),
}));
```

### 一对多

```typescript
export const usersRelations = relations(users, ({ many }) => ({
  posts: many(posts),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));
```

### 多对多

```typescript
export const postsToTags = pgTable('posts_to_tags', {
  postId: integer('post_id').references(() => posts.id),
  tagId: integer('tag_id').references(() => tags.id),
});

export const postsRelations = relations(posts, ({ many }) => ({
  postsToTags: many(postsToTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  postsToTags: many(postsToTags),
}));
```

## 查询构建器

### 选择

```typescript
const result = await db
  .select({
    id: users.id,
    name: users.name,
    email: users.email,
  })
  .from(users)
  .where(eq(users.name, 'John'))
  .orderBy(users.name)
  .limit(10)
  .offset(0);
```

### 连接

```typescript
const result = await db
  .select()
  .from(users)
  .leftJoin(posts, eq(users.id, posts.authorId))
  .where(eq(users.name, 'John'));
```

### 聚合

```typescript
import { count, avg, sum } from 'drizzle-orm';

const result = await db
  .select({
    count: count(),
    avgAge: avg(users.age),
    totalAge: sum(users.age),
  })
  .from(users);
```

## 迁移

### 生成迁移

```bash
npx drizzle-kit generate
```

### 运行迁移

```bash
npx drizzle-kit migrate
```

### 推送 Schema

```bash
npx drizzle-kit push
```

## Drizzle Studio

Drizzle Studio 是一个可视化数据库管理工具。

```bash
npx drizzle-kit studio
```

访问 [local.drizzle.studio](http://local.drizzle.studio) 查看你的数据库。

## 与其他 ORM 的比较

### 与 Prisma 的比较

| 特性 | Drizzle | Prisma |
|------|---------|--------|
| 包大小 | 7.4kb | 2.8MB |
| 类型推断 | 完整 | 部分 |
| API 风格 | SQL-like | 自定义 |
| 学习曲线 | 低 | 中等 |
| 性能 | 高 | 中等 |

### 与 TypeORM 的比较

| 特性 | Drizzle | TypeORM |
|------|---------|---------|
| 包大小 | 7.4kb | 1.5MB |
| 类型推断 | 完整 | 部分 |
| API 风格 | SQL-like | 装饰器 |
| 学习曲线 | 低 | 中等 |
| 性能 | 高 | 中等 |

## 示例

- [PostgreSQL 示例](./examples/postgres)
- [MySQL 示例](./examples/mysql)
- [SQLite 示例](./examples/sqlite)

## 文档

访问 [orm.drizzle.team](https://orm.drizzle.team) 查看完整文档。

## 贡献

欢迎贡献！请阅读 [贡献指南](./CONTRIBUTING.md) 了解如何参与。

## 许可证

MIT
