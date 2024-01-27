import { sql } from "drizzle-orm";
import {
  mysqlTable,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

export const Users = mysqlTable(
  "user",
  {
    id: varchar("id", { length: 255 }).notNull().primaryKey(),
    handle: varchar("handle", { length: 31 }),
    email: varchar("email", { length: 255 }).notNull(),
    bio: varchar("bio", { length: 511 }),
    joined: timestamp("joined", { mode: "date" })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  }
);
