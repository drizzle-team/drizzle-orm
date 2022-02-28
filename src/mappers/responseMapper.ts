import { QueryResult } from 'pg';

import { AbstractColumn } from '../columns/column';
import ColumnType from '../columns/types/columnType';
import { AbstractTable } from '../tables';
import { ExtractModel, ExtractColumns, PartialFor } from '../tables/inferTypes';

// eslint-disable-next-line max-len
// const checkProperties = (obj: any) => Object.values(obj).every((x) => x === null || Number.isNaN(x));

export default class QueryResponseMapper {
	public static map<T extends AbstractTable<T>>(
		selection: ExtractColumns<T>,
		queryResult: QueryResult<any>,
		joinId?: number,
	): ExtractModel<T>[];

  public static map<T extends AbstractTable<T>>(
		selection: PartialFor<T>,
		queryResult: QueryResult<any>,
		joinId?: number,
	): ExtractModel<PartialFor<T>>[];

	public static map<T extends AbstractTable<T>>(
		selection: ExtractColumns<T> | PartialFor<T>,
		queryResult: QueryResult<any>,
		joinId?: number,
	) {
		const response: ExtractModel<T>[] = [];

		queryResult.rows.forEach((row) => {
			const mappedRow: ExtractModel<T> = {} as ExtractModel<T>;

			Object.keys(selection).forEach((key) => {
				const column = selection[key as keyof ExtractColumns<T>];
				const alias = `${column.getAlias()}${joinId ? `_${joinId}` : ''}`;
				const value = column.getColumnType().selectStrategy(row[alias]) as any;
				mappedRow[key as keyof ExtractModel<T>] = value === null ? undefined : value;
			});
			response.push(mappedRow);
		});
		return response;
	}
}
