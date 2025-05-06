import { renderWithTask } from 'hanji';
import { fromDatabase } from '../../dialects/postgres/introspect';
import { Entities } from '../validations/cli';
import { Casing, Prefix } from '../validations/common';
import { GelCredentials } from '../validations/gel';
import { IntrospectProgress } from '../views';
import { prepareTablesFilter } from './utils';

export const handle = async (
	casing: Casing,
	out: string,
	breakpoints: boolean,
	credentials: GelCredentials | undefined,
	tablesFilter: string[],
	schemasFilter: string[],
	prefix: Prefix,
	entities: Entities,
) => {
	const { prepareGelDB } = await import('../connections');
	const db = await prepareGelDB(credentials);

	const filter = prepareTablesFilter(tablesFilter);
	const progress = new IntrospectProgress(true);

	const res = await renderWithTask(
		progress,
		fromDatabase(
			db,
			filter,
			(x) => schemasFilter.some((s) => x === s),
			entities,
			(stage, count, status) => {
				progress.update(stage, count, status);
			},
		),
	);

	const schema = { id: originUUID, prevId: '', ...res } as GelSchema;
	const ts = gelSchemaToTypeScript(schema, casing);
	const relationsTs = relationsToTypeScript(schema, casing);
	const { internal, ...schemaWithoutInternals } = schema;

	const schemaFile = join(out, 'schema.ts');
	writeFileSync(schemaFile, ts.file);
	const relationsFile = join(out, 'relations.ts');
	writeFileSync(relationsFile, relationsTs.file);
	console.log();

	// const { snapshots, journal } = prepareOutFolder(out, 'gel');

	// if (snapshots.length === 0) {
	// 	const { sqlStatements, _meta } = await applyGelSnapshotsDiff(
	// 		squashGelScheme(dryGel),
	// 		squashGelScheme(schema),
	// 		schemasResolver,
	// 		enumsResolver,
	// 		sequencesResolver,
	// 		policyResolver,
	// 		indPolicyResolver,
	// 		roleResolver,
	// 		tablesResolver,
	// 		columnsResolver,
	// 		viewsResolver,
	// 		dryPg,
	// 		schema,
	// 	);

	// 	writeResult({
	// 		cur: schema,
	// 		sqlStatements,
	// 		journal,
	// 		_meta,
	// 		outFolder: out,
	// 		breakpoints,
	// 		type: 'introspect',
	// 		prefixMode: prefix,
	// 	});
	// } else {
	// 	render(
	// 		`[${
	// 			chalk.blue(
	// 				'i',
	// 			)
	// 		}] No SQL generated, you already have migrations in project`,
	// 	);
	// }

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your schema file is ready ➜ ${chalk.bold.underline.blue(schemaFile)} 🚀`,
	);
	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your relations file is ready ➜ ${
			chalk.bold.underline.blue(
				relationsFile,
			)
		} 🚀`,
	);
	process.exit(0);
};
