import { InterimSchema, interimToDDL } from '../dialects/postgres/ddl';
import { ddlDiff } from '../dialects/postgres/diff';
import { mockResolver } from './mocks';

export const diffPostgresql = async (
	from: InterimSchema,
	to: InterimSchema,
	renamesArr: string[],
) => {
	const { ddl: ddl1 } = interimToDDL(from);
	const { ddl: ddl2 } = interimToDDL(to);

	const renames = new Set(renamesArr);

	const { sqlStatements, groupedStatements, statements } = await ddlDiff(
		ddl1,
		ddl2,
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames),
		mockResolver(renames), // views
		mockResolver(renames), // uniques
		mockResolver(renames), // indexes
		mockResolver(renames), // checks
		mockResolver(renames), // pks
		'default',
	);

	return { sqlStatements, groupedStatements, statements };
};

// const main = async () => {
// 	const res = await diffPostgresql(
// 		{
// 			schemas: [],
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
