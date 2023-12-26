import type { db } from "./db";
import type {
  Users,
} from "./schema";

export type DB = typeof db;

// Base
export type User = typeof Users.$inferSelect;
