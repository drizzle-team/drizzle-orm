import { Pool } from 'pg';

import { Defaults } from './src/columns';
import { DB } from './src/db';
import Session from './src/db/session';
import MigrationSerializer from './src/serializer/serializer';
import AbstractTable from './src/tables/abstractTable';

export class JobsTable extends AbstractTable<JobsTable> {
	public id = this.serial('id').notNull();
	public id2 = this.bigint('bigid', 'max_bytes_53').defaultValue(100).notNull();
	public id3 = this.bigint('bigid64', 'max_bytes_64').defaultValue(BigInt(100)).notNull();

	public organization_id = this.int('organization_id').defaultValue(10).notNull();
	public next_run = this.timestamptz('next_run')
		.defaultValue(Defaults.CURRENT_TIMESTAMP)
		.notNull();
	public next_run2 = this.timestamptz('next_run2').defaultValue(new Date()).notNull();
	public comment = this.text('comment').defaultValue('hui');
	public comment2 = this.varchar('comment2').defaultValue('hui');
	public comment3 = this.varchar('comment3', { size: 256 }).defaultValue('hui');

	public tableName(): string {
		return 'jobs';
	}
}

const db = new DB(new Session(new Pool()));

const result = new MigrationSerializer().generate([new JobsTable(db)], []);
console.log(JSON.stringify(result, undefined, 2));
