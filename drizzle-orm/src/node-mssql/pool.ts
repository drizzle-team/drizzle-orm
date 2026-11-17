import mssql from 'mssql';
import { entityKind, is } from '~/entity.ts';

export class AutoPool {
	static readonly [entityKind]: string = 'AutoPool';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	private pool: mssql.ConnectionPool;

	constructor(config: string | mssql.config) {
		this.pool = new mssql.ConnectionPool(config as any);
	}

	async $instance() {
		await this.pool.connect().catch((err) => {
			console.error('❌ AutoPool failed to connect:', err);
			throw err;
		});
		return this.pool;
	}
}
