import { prepareTestSQL } from '../utils'
import { DbConnector } from "drizzle-orm";
import path from "path";
import "pretty-error/start";
import { test } from "uvu";

test("import dry json", async () => {
  const { initSQL, migrationSQL } = await prepareTestSQL(
    path.join(__dirname, "suite1")
  );
  const db = await new DbConnector()
    .connectionString(
      "postgresql://postgres:lambdapass@127.0.0.1:5432/postgres"
    )
    .connect();
  console.log(initSQL);
  await db.session().execute(initSQL);
  console.log(migrationSQL);
  await db.session().execute(migrationSQL);
});

test.run();
