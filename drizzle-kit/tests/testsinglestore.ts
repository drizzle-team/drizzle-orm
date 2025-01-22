import { index, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import { diffTestSchemasSingleStore } from './schemaDiffer';

const from = {
	users: singlestoreTable(
		'table',
		{
			name: text('name'),
		},
		(t) => {
			return {
				idx: index('name_idx').on(t.name),
			};
		},
	),
};

const to = {
	users: singlestoreTable('table', {
		name: text('name'),
	}),
};

diffTestSchemasSingleStore(from, to, []).then((res) => {
	const { statements, sqlStatements } = res;

	console.log(statements);
	console.log(sqlStatements);
});
