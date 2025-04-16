import { randomUUID } from 'crypto';
import fs from 'fs';
import { CasingType } from './cli/validations/common';
import { serializeSingleStore } from './serializer';
import { drySingleStore, SingleStoreSchema, singlestoreSchema } from './serializer/singlestoreSchema';

export const prepareSingleStoreDbPushSnapshot = async (
	prev: SingleStoreSchema,
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<{ prev: SingleStoreSchema; cur: SingleStoreSchema }> => {
	const serialized = await serializeSingleStore(schemaPath, casing);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: SingleStoreSchema = { version, dialect, id, prevId: idPrev, ...rest };

	return { prev, cur: result };
};

export const prepareSqlitePushSnapshot = async (
	prev: SQLiteSchema,
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<{ prev: SQLiteSchema; cur: SQLiteSchema }> => {
	const serialized = await serializeSqlite(schemaPath, casing);

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
	casing: CasingType | undefined,
	schemaFilter: string[] = ['public'],
): Promise<{ prev: PgSchema; cur: PgSchema }> => {
	const serialized = await serializePg(schemaPath, casing, schemaFilter);

	const id = randomUUID();
	const idPrev = prev.id;

	const { version, dialect, ...rest } = serialized;
	const result: PgSchema = { version, dialect, id, prevId: idPrev, ...rest };

	return { prev, cur: result };
};

export const prepareSingleStoreMigrationSnapshot = async (
	migrationFolders: string[],
	schemaPath: string | string[],
	casing: CasingType | undefined,
): Promise<{ prev: SingleStoreSchema; cur: SingleStoreSchema; custom: SingleStoreSchema }> => {
	const prevSnapshot = singlestoreSchema.parse(
		preparePrevSnapshot(migrationFolders, drySingleStore),
	);
	const serialized = await serializeSingleStore(schemaPath, casing);

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
