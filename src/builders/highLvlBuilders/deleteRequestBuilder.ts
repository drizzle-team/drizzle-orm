/* eslint-disable max-len */
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ISession } from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { AbstractTable } from '../../tables';
import { ExtractModel } from '../../tables/inferTypes';
import Delete from '../lowLvlBuilders/delets/delete';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';

export default class DeleteTRB<TTable extends AbstractTable<TTable>, TPartial extends {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, TTable>} = {}>
  extends TableRequestBuilder<TTable, TPartial> {
  private _filter: Expr;

  public constructor(
    table: AbstractTable<TTable>,
    session: ISession,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    logger?: BaseLogger,
  ) {
    super(table, session, mappedServiceToDb, logger);
  }

  public where = (expr: Expr): DeleteTRB<TTable> => {
    this._filter = expr;
    return this;
  };

  public execute = async () => {
    await this._execute();
  };

  protected _execute = async (): Promise<Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial> | undefined>> => {
    const queryBuilder = Delete
      .from(this._table)
      .filteredBy(this._filter);

    let query = '';
    try {
      query = queryBuilder.build();
    } catch (e: any) {
      throw new BuilderError(BuilderType.DELETE, this._table.tableName(),
        this._columns, e, this._filter);
    }

    if (this._logger) {
      this._logger.info(`Deleting from ${this._table.tableName()} using query:\n ${query}`);
    }

    const result = await this._session.execute(query);
    return QueryResponseMapper.map(this._mappedServiceToDb, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial> | undefined>;
  };
}
