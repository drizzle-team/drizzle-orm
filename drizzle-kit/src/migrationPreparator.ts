import { randomUUID } from 'crypto';
import fs from 'fs';
import { serializeMySql, serializePg, serializeSingleStore, serializeSQLite } from './serializer';
import { dryMySql, MySqlSchema, mysqlSchema } from './serializer/mysqlSchema';
import { dryPg, PgSchema, pgSchema, PgSchemaInternal } from './serializer/pgSchema';
import { drySingleStore, SingleStoreSchema, singlestoreSchema } from './serializer/singlestoreSchema';
import { drySQLite, SQLiteSchema, sqliteSchema } from './serializer/sqliteSchema';
import { drySingleStore, singlestoreSchema, SingleStoreSchema } from './serializer/singlestoreSchema';

export const prepareMySqlDbPushSnapshot = async (
	prev: MySqlSchema,
	schemaPath: string | string[],
): Promise<{ prev: MySqlSchema; cur: MySqlSchema }> => {
	const serialized = await serializeMySql(schemaPath);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: MySqlSchema = { version, dialect, id, prevId: idPrev, ...rest };

	return { prev, cur: result };
};

export const prepareSingleStoreDbPushSnapshot = async (
	prev: SingleStoreSchema,
	schemaPath: string | string[],
): Promise<{ prev: SingleStoreSchema; cur: SingleStoreSchema }> => {
	const serialized = await serializeSingleStore(schemaPath);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: SingleStoreSchema = { version, dialect, id, prevId: idPrev, ...rest };

	return { prev, cur: result };
};

export const prepareSQLiteDbPushSnapshot = async (
	prev: SQLiteSchema,
	schemaPath: string | string[],
): Promise<{ prev: SQLiteSchema; cur: SQLiteSchema }> => {
	const serialized = await serializeSQLite(schemaPath);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: SQLiteSchema = {
		version,
		dialect,
		id,
		prevId: idPrev,
		...rest,
	};

	return { prev, cur: result };
};

export const preparePgDbPushSnapshot = async (
	prev: PgSchema,
	schemaPath: string | string[],
	schemaFilter: string[] = ['public'],
): Promise<{ prev: PgSchema; cur: PgSchema }> => {
	const serialized = await serializePg(schemaPath, schemaFilter);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: PgSchema = { version, dialect, id, prevId: idPrev, ...rest };

	return { prev, cur: result };
};

export const prepareMySqlMigrationSnapshot = async (
	migrationFolders: string[],
	schemaPath: string | string[],
): Promise<{ prev: MySqlSchema; cur: MySqlSchema; custom: MySqlSchema }> => {
	const prevSnapshot = mysqlSchema.parse(
		preparePrevSnapshot(migrationFolders, dryMySql),
	);
	const serialized = await serializeMySql(schemaPath);

	const id = randomUUID();
	const idPrev = prevSnapshot.id;

	const { version, dialect, ...rest } = serialized;
	const result: MySqlSchema = { version, dialect, id, prevId: idPrev, ...rest };

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: MySqlSchema = {
		id,
		prevId: idPrev,
		...prevRest,
	};

	return { prev: prevSnapshot, cur: result, custom };
};

export const prepareSingleStoreMigrationSnapshot = async (
	migrationFolders: string[],
	schemaPath: string | string[],
): Promise<{ prev: SingleStoreSchema; cur: SingleStoreSchema; custom: SingleStoreSchema }> => {
	const prevSnapshot = singlestoreSchema.parse(
		preparePrevSnapshot(migrationFolders, drySingleStore),
	);
	const serialized = await serializeSingleStore(schemaPath);

	const id = randomUUID();
	const idPrev = prevSnapshot.id;

	const { version, dialect, ...rest } = serialized;
	const result: SingleStoreSchema = { version, dialect, id, prevId: idPrev, ...rest };

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SingleStoreSchema = {
		id,
		prevId: idPrev,
		...prevRest,
	};

	return { prev: prevSnapshot, cur: result, custom };
};

export const prepareSqliteMigrationSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
): Promise<{ prev: SQLiteSchema; cur: SQLiteSchema; custom: SQLiteSchema }> => {
	const prevSnapshot = sqliteSchema.parse(
		preparePrevSnapshot(snapshots, drySQLite),
	);
	const serialized = await serializeSQLite(schemaPath);

	const id = randomUUID();
	const idPrev = prevSnapshot.id;

	const { version, dialect, ...rest } = serialized;
	const result: SQLiteSchema = {
		version,
		dialect,
		id,
		prevId: idPrev,
		...rest,
	};

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: SQLiteSchema = {
		id,
		prevId: idPrev,
		...prevRest,
	};

	return { prev: prevSnapshot, cur: result, custom };
};

export const fillPgSnapshot = ({
	serialized,
	id,
	idPrev,
}: {
	serialized: PgSchemaInternal;
	id: string;
	idPrev: string;
}): PgSchema => {
	// const id = randomUUID();
	return { id, prevId: idPrev, ...serialized };
};

export const preparePgMigrationSnapshot = async (
	snapshots: string[],
	schemaPath: string | string[],
): Promise<{ prev: PgSchema; cur: PgSchema; custom: PgSchema }> => {
	const prevSnapshot = pgSchema.parse(preparePrevSnapshot(snapshots, dryPg));
	const serialized = await serializePg(schemaPath);

	const id = randomUUID();
	const idPrev = prevSnapshot.id;

	// const { version, dialect, ...rest } = serialized;

	const result: PgSchema = { id, prevId: idPrev, ...serialized };

	const { id: _ignoredId, prevId: _ignoredPrevId, ...prevRest } = prevSnapshot;

	// that's for custom migrations, when we need new IDs, but old snapshot
	const custom: PgSchema = fillPgSnapshot({ serialized: prevRest, id, idPrev });

	return { prev: prevSnapshot, cur: result, custom };
};

const preparePrevSnapshot = (snapshots: string[], defaultPrev: any) => {
	let prevSnapshot: any;

	if (snapshots.length === 0) {
		prevSnapshot = defaultPrev;
	} else {
		const lastSnapshot = snapshots[snapshots.length - 1];
		prevSnapshot = JSON.parse(fs.readFileSync(lastSnapshot).toString());
	}
	return prevSnapshot;
};
