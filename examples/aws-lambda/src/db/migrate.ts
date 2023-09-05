import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const migrationClient = postgres("postgresql://postgres:postgres@localhost:5432/drizzle", { max: 1 });

// this will automatically run needed migrations on the database
migrate(drizzle(migrationClient), { migrationsFolder: "./src/db/migrations" })
  .then(() => {
    console.log("Migrations complete!");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Migrations failed!", err);
    process.exit(1);
  });
