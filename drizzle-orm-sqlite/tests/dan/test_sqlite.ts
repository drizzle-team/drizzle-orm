import Database from 'better-sqlite3';
import path from 'path';

const client = new Database(path.resolve(__dirname, '../database.db'));
// const stmt = client.prepare('insert into test (int_value) values (?)').bind(
// 	Buffer.from(JSON.stringify({ foo: 'bar' })),
// );
// stmt.run();
const stmt = client.prepare('select *, rowid from test');
stmt.raw();
const rows = stmt.all();
console.log(rows);
