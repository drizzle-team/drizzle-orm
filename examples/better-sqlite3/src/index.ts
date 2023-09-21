import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { projects, users } from "./schema";

const sqlite = new Database("./sqlite.db");
const db = drizzle(sqlite);

const res = db
  .insert(users)
  .values([
    {
      fullName: "User_" + Date.now().toString(),
    },
  ])
  .run();

const userId = res.lastInsertRowid;

db.insert(projects)
  .values([
    {
      name: "Project_" + Date.now().toString(),
      ownerId: userId as number,
    },
  ])
  .run();

const allUsersAndProjects = db
  .select()
  .from(users)
  .leftJoin(projects, eq(users.id, projects.ownerId))
  .all();

console.log(allUsersAndProjects);
