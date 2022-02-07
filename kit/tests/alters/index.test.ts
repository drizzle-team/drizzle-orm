import { test } from 'uvu';
import path from 'path'
import { DbConnector } from 'drizzle-orm';
import 'pretty-error/start';
import { prepareTestSQL } from '../../src/testrunner'


test('import dry json', async () => {
    const {initSQL, migrationSQL} = await prepareTestSQL(path.join(__dirname, "suite1"))
    const db = await new DbConnector().connectionString("postgresql://postgres:lambdapass@127.0.0.1:5432/postgres").connect()
    console.log(initSQL)
    await db.session().execute(initSQL)
    console.log(migrationSQL)
    await db.session().execute(migrationSQL)
})

test.run();