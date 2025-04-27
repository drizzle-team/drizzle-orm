import { renderWithTask } from 'hanji';
import { Minimatch } from 'minimatch';
import { originUUID } from '../../global';
import type { SingleStoreSchema } from '../../serializer/singlestoreSchema';
import { fromDatabase } from '../../serializer/singlestoreSerializer';
import type { DB } from '../../utils';
import { ProgressView } from '../views';
import { drySingleStore, squashSingleStoreScheme } from 'src/serializer/singlestoreSchema';
import { schemaToTypeScript as singlestoreSchemaToTypeScript } from '../../introspect-singlestore';
import { fromDatabase as fromSingleStoreDatabase } from '../../serializer/singlestoreSerializer';
import { applySingleStoreSnapshotsDiff } from '../../snapshot-differ/singlestore';
import { prepareOutFolder } from '../../utils-node';
import type { Casing, Prefix } from '../validations/common';
import { SingleStoreCredentials } from '../validations/singlestore';
import { IntrospectProgress } from '../views';
import { writeResult } from './generate-common';
import { writeFileSync } from 'fs';

export const introspectSingleStore = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	prefix: Prefix,
) => {
	const { connectToSingleStore } = await import('../connections');
	const { db, database } = await connectToSingleStore(credentials);

	const matchers = tablesFilter.map((it) => {
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
		fromSingleStoreDatabase(db, database, filter, (stage, count, status) => {
			progress.update(stage, count, status);
		}),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SingleStoreSchema;
	const ts = singlestoreSchemaToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	console.log();

	const { snapshots, journal } = prepareOutFolder(out, 'postgresql');

	if (snapshots.length === 0) {
		const { sqlStatements, _meta } = await applySingleStoreSnapshotsDiff(
			squashSingleStoreScheme(drySingleStore),
			squashSingleStoreScheme(schema),
			tablesResolver,
			columnsResolver,
			/* singleStoreViewsResolver, */
			drySingleStore,
			schema,
		);

		writeResult({
			snapshot: schema,
			sqlStatements,
			journal,
			_meta,
			outFolder: out,
			breakpoints,
			type: 'introspect',
			prefixMode: prefix,
		});
	} else {
		render(
			`[${
				chalk.blue(
					'i',
				)
			}] No SQL generated, you already have migrations in project`,
		);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] You schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	process.exit(0);
};


export const singlestorePushIntrospect = async (
	db: DB,
	databaseName: string,
	filters: string[],
) => {
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
	const res = await renderWithTask(
		progress,
		fromDatabase(db, databaseName, filter),
	);

	const schema = { id: originUUID, prevId: '', ...res } as SingleStoreSchema;
	const { internal, ...schemaWithoutInternals } = schema;
	return { schema: schemaWithoutInternals };
};
