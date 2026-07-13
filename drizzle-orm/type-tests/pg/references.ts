import { type Equal, Expect } from "type-tests/utils";
import { pgTable, uuid, varchar } from "~/pg-core";

const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
});

const posts = pgTable("posts", {
  id: uuid("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  userId: uuid("user_id").references(() => users.id),
});

const nonNullPosts = pgTable("non_null_posts", {
  id: uuid("id").primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  userId: uuid("user_id").references(() => users.id).notNull(),
});

{
  type PostReference = typeof posts.userId.references;

  Expect<Equal<PostReference, typeof users.id | undefined>>();
}

{
  type NonNullPostReference = typeof nonNullPosts.userId.references;

  Expect<Equal<NonNullPostReference, typeof users.id>>();
}
