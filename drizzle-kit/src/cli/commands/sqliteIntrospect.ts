import { renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { originUUID } from '../../global';
import { schemaToTypeScript } from '../../introspect-sqlite';
import type { SQLiteSchema } from '../../serializer/sqliteSchema';
import { fromDatabase } from '../../serializer/sqliteSerializer';
import type { SQLiteDB } from '../../utils';
import { Casing } from '../validations/common';
import type { SqliteCredentials } from '../validations/sqlite';
import { IntrospectProgress, ProgressView } from '../views';

export const sqliteIntrospect = async (
	credentials: SqliteCredentials,
	filters: string[],
	casing: Casing,
) => {
	const { connectToSQLite } = await import('../connections');
	const db = await connectToSQLite(credentials);

	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};

	const progress = new IntrospectProgress();
	const res = await renderWithTask(
		progress,
		fromDatabase(db, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SQLiteSchema;
	const ts = schemaToTypeScript(schema, casing);
	return { schema, ts };
};

export const sqlitePushIntrospect = async (db: SQLiteDB, filters: string[]) => {
	const matchers = filters.map((it) => {
		return new Minimatch(it);
	});

	const filter = (tableName: string) => {
		if (matchers.length === 0) return true;

		let flags: boolean[] = [];

		for (let matcher of matchers) {
			if (matcher.negate) {
				if (!matcher.match(tableName)) {
					flags.push(false);
				}
			}

			if (matcher.match(tableName)) {
				flags.push(true);
			}
		}

		if (flags.length > 0) {
			return flags.every(Boolean);
		}
		return false;
	};

	const progress = new ProgressView(
		'Pulling schema from database...',
		'Pulling schema from database...',
	);
	const res = await renderWithTask(progress, fromDatabase(db, filter));

	const schema = { id: originUUID, prevId: '', ...res } as SQLiteSchema;
	return { schema };
};
