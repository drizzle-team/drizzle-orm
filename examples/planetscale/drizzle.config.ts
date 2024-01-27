import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

export default defineConfig({
  schema: "./src/schema.ts",
  driver: "mysql2",
  dbCredentials: {
    uri: `mysql://${process.env.DATABASE_USERNAME}:${process.env.DATABASE_PASSWORD}@${process.env.DATABASE_HOST}/carbon?ssl={"rejectUnauthorized":true}`,
  },
});
