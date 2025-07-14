/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { SQLWrapper } from 'drizzle-beta';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export const db = drizzle({ connection: 'postgres:/...' });

interface MinimalColumn<TName extends string = string, TTableName extends string = string> {
	_: {
		brand: 'Column';
		name: TName;
		data: any;
		columnType: string;
	};

	name: string;
	dataType: any;
	columnType: string;
	// table: MinimalTable<TTableName>;
	mapFromDriverValue(value: any): any;
	mapToDriverValue(value: any): any;
}

interface MinimalTable<TName extends string = string, TSchema extends string | undefined = string | undefined> // extends SQLWrapper
{
	_: {
		brand: 'Table';
		name: TName;
		schema: TSchema;
		columns: Record<string, MinimalColumn>;
		// inferSelect: Record<string, any>;
	};
}

// interface Container<TName extends string, T extends MinimalTable> {
// 	table: T;
// 	columns: T extends MinimalTable ? T['_']['columns'] : never;
// 	name: TName;
// 	remapped: T extends MinimalTable ? AnyTable<{ name: TName }> : View<TName>;
// }

type Check<TTables extends Record<string, MinimalTable>> = {
	[K in keyof TTables]: TTables[K]['_'];
};

export type Tmp = Check<typeof schema>;
