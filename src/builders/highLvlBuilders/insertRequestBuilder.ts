import { combine, set } from '../';
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ISession } from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { AbstractTable } from '../../tables';
import { ExtractModel, Indexing, PartialFor, ExtractColumns } from '../../tables/inferTypes';
import Insert from '../lowLvlBuilders/inserts/insert';
import { UpdateExpr } from '../requestBuilders/updates/updates';
import TableRequestBuilder from './abstractRequestBuilder';

export default class InsertTRB<
	TTable extends AbstractTable<TTable>,
> extends TableRequestBuilder<TTable> {
	private _values: ExtractColumns<TTable>[];
	private _onConflict: UpdateExpr;
	private _onConflictField: Indexing;

	public constructor(
		values: ExtractColumns<TTable>[],
		session: ISession,
		mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType> },
		table: AbstractTable<TTable>,
		logger?: BaseLogger,
	) {
		super(table, session, mappedServiceToDb, logger);
		this._values = values;
	}

	public execute = async () => {
		await this._execute();
	};

	public onConflict = (
		callback: (table: TTable) => Indexing,
		update: Partial<ExtractModel<TTable>>,
	): this => {
		this._onConflictField = callback(this._table);
		const updates: Array<UpdateExpr> = [];
		Object.entries(update).forEach(([key, value]) => {
			const column = this._mappedServiceToDb[key as keyof ExtractModel<TTable> & string];
			updates.push(set(column, value as any));
		});
		this._onConflict = combine(updates);
		return this;
	};

	protected _execute = async (): Promise<ExtractModel<TTable>[]> => {
		if (!this._values)
			throw Error('Values should be provided firestly\nExample: table.values().execute()');

		const queryBuilder = Insert.into(this._table)
			.values(this._values)
			.onConflict(this._onConflict, this._onConflictField);

		let query = '';
		let values = [];
		try {
			const builderResult = queryBuilder.build();
			query = builderResult.query;
			values = builderResult.values;
		} catch (e: any) {
			throw new BuilderError(BuilderType.INSERT, this._table.tableName(), this._columns, e);
		}

		if (this._logger) {
			this._logger.info(
				`Inserting to ${this._table.tableName()} using query:\n ${query}\n${values}`,
			);
		}

		const result = await this._session.execute(query, values);
		return QueryResponseMapper.map(this._mappedServiceToDb, result);
	};
}
