import { SQLiteDB } from 'src/utils';
import { prepareTestDatabase, TestDatabase } from './mocks';

let _: TestDatabase = prepareTestDatabase();
let db: SQLiteDB = _.db;

const main = async () => {
	await db.run('create table users(id integer);');

	await _.clear();

	await db.run('create table users(id integer);');
	await db.run('insert into users values(1);');
	const res = await db.query('select * from users;');
	console.log(res);
};

main();
