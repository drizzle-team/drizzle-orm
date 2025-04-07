import { pgSchema, PostgresGenerateSquasher, squashPgScheme } from '../dialects/postgres/ddl';
import { generateFromOptional, InterimOptionalSchema } from '../dialects/postgres/drizzle';
import { applyPgSnapshotsDiff } from '../dialects/postgres/diff';
import {
	mockColumnsResolver,
	mockedNamedResolver,
	mockedNamedWithSchemaResolver,
	mockEnumsResolver,
	mockPolicyResolver,
	mockSchemasResolver,
	mockTablesResolver,
	testSequencesResolver,
} from './mocks';

export const diffPostgresql = async (
	from: InterimOptionalSchema,
	to: InterimOptionalSchema,
	renamesArr: string[],
) => {
	const snpsh1 = generateFromOptional(from);
	const sch1 = {
		id: '0',
		prevId: '0',
		...snpsh1,
	} as const;

	const snpsh2 = generateFromOptional(to);
	const sch2 = {
		id: '0',
		prevId: '0',
		...snpsh2,
	} as const;
	const squasher = PostgresGenerateSquasher;

	const sn1 = squashPgScheme(sch1, squasher);
	const sn2 = squashPgScheme(sch2, squasher);

	const validatedPrev = pgSchema.parse(sch1);
	const validatedCur = pgSchema.parse(sch2);

	const renames = new Set(renamesArr);

	const { sqlStatements, groupedStatements, statements } = await applyPgSnapshotsDiff(
		sn1,
		sn2,
		mockSchemasResolver(renames),
		mockEnumsResolver(renames),
		testSequencesResolver(renames),
		mockPolicyResolver(renames),
		mockedNamedResolver(renames),
		mockedNamedResolver(renames),
		mockTablesResolver(renames),
		mockColumnsResolver(renames),
		mockedNamedWithSchemaResolver(renames), // views
		mockedNamedResolver(renames), // uniques
		mockedNamedResolver(renames), // indexes
		mockedNamedResolver(renames), // checks
		mockedNamedResolver(renames), // pks
		mockedNamedResolver(renames), // fks
		validatedPrev,
		validatedCur,
		squasher,
	);

	return { sqlStatements, groupedStatements, statements };
};

// const main = async () => {
// 	const res = await diffPostgresql(
// 		{
// 			schemas: ['public'],
// 			tables: [
// 				{
// 					name: 'users',
// 					schema: 'public',
// 					columns: [
// 						{
// 							name: 'id',
// 							type: 'serial',
// 							primaryKey: true,
// 							notNull: false,
// 						},
// 					],
// 				},
// 			],
// 		},
// 		{
// 			schemas: ['public'],
// 			tables: [
// 				{
// 					name: 'users',
// 					schema: 'public',
// 					columns: [
// 						{
// 							name: 'id2',
// 							type: 'serial',
// 							primaryKey: true,
// 							notNull: false,
// 						},
// 						{
// 							name: 'name',
// 							type: 'text',
// 							primaryKey: false,
// 							notNull: true,
// 							isUnique: true,
// 						},
// 					],
// 				},
// 			],
// 		},
// 		['public.users.id->public.users.id2'],
// 	);
// 	console.dir(res, { depth: 10 });
// };

// main();
