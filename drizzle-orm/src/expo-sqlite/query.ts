import { addDatabaseChangeListener } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { is } from '~/entity.ts';
import { SQL } from '~/sql/sql.ts';
import { SQLiteAsyncRelationalQuery } from '~/sqlite-core/async/query.ts';
import type { AnySQLiteAsyncSelect } from '~/sqlite-core/async/select.ts';
import { getTableConfig, getViewConfig, SQLiteTable, SQLiteView } from '~/sqlite-core/index.ts';
import { Subquery } from '~/subquery.ts';

export const useLiveQuery = <
	T extends
		| Pick<AnySQLiteAsyncSelect, '_' | 'then'>
		| SQLiteAsyncRelationalQuery<'sync', unknown>,
>(
	query: T,
	deps: unknown[] = [],
) => {
	const [data, setData] = useState<Awaited<T>>(
		(is(query, SQLiteAsyncRelationalQuery) && query.mode === 'first'
			? undefined
			: []) as Awaited<T>,
	);
	const [error, setError] = useState<Error>();
	const [updatedAt, setUpdatedAt] = useState<Date>();

	useEffect(() => {
		const entity = is(query, SQLiteAsyncRelationalQuery)
			? query.table
			: (query as AnySQLiteAsyncSelect).config.table;

		if (is(entity, Subquery) || is(entity, SQL)) {
			setError(new Error('Selecting from subqueries and SQL are not supported in useLiveQuery'));
			return;
		}

		let listener: ReturnType<typeof addDatabaseChangeListener> | undefined;

		const handleData = (data: any) => {
			setData(data);
			setUpdatedAt(new Date());
		};

		query.then(handleData).catch(setError);

		if (is(entity, SQLiteTable) || is(entity, SQLiteView)) {
			const config = is(entity, SQLiteTable) ? getTableConfig(entity) : getViewConfig(entity);
			listener = addDatabaseChangeListener(({ tableName }) => {
				if (config.name === tableName) {
					query.then(handleData).catch(setError);
				}
			});
		}

		return () => {
			listener?.remove();
		};
	}, deps);

	return {
		data,
		error,
		updatedAt,
	} as const;
};
