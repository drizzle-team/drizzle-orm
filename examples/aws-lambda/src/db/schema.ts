import { pgTable, text, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("uuid1").defaultRandom().primaryKey(),
  name: text("name"),
});
