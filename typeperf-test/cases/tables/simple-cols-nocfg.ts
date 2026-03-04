/* eslint-disable unused-imports/no-unused-imports */
/* eslint-disable @typescript-eslint/no-unused-vars */
import type { AnyTable, Assume, SQL, SQLWrapper, View } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { schema } from '../../lib/schema.ts';

export const db = drizzle({ connection: 'postgres:/...' });

interface MinimalColumn<TName extends string = string, TTableName extends string = string> {
	// _: {
	// 	brand: 'Column';
	// 	name: TName;
	// 	data: any;
	// 	columnType: string;
	// };

	name: string;
	dataType: any;
	columnType: string;
	// table: MinimalTable<TTableName> | MinimalView<TTableName>;
	mapFromDriverValue(value: any): any;
	mapToDriverValue(value: any): any;
}

interface MinimalTable<TName extends string = string, TSchema extends string | undefined = string | undefined>
	extends SQLWrapper
{
	_: {
		brand: 'Table';
		name: TName;
		schema: TSchema;
		columns: Record<string, MinimalColumn>;
		// inferSelect: Record<string, any>;
	};
}

interface MinimalView<TName extends string = string, TSchema extends string | undefined = string | undefined>
	extends SQLWrapper
{
	_: {
		brand: 'View';
		name: TName;
		schema?: TSchema;
		selectedFields: Record<string, MinimalColumn | SQLWrapper | SQL.Aliased>;
	};

	$inferSelect: Record<string, any>;
}

interface Container<TName extends string, T extends MinimalTable | MinimalView> {
	table: T;
	columns: T extends MinimalTable ? T['_']['columns'] : Assume<T, MinimalView>['_']['selectedFields'];
	name: TName;
	remapped: T extends MinimalTable ? AnyTable<{ name: TName }> : View<TName>;
}

type Check<TTables extends Record<string, MinimalTable | MinimalView>> = {
	[K in keyof TTables & string]: TTables[K] extends MinimalTable<infer Name, infer Schema> | MinimalView<infer Name>
		? Container<Assume<K, string>, TTables[K]>
		: never;
};

export type Tmp = Check<typeof schema>;
