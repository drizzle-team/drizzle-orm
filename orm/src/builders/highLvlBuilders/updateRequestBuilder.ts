/* eslint-disable max-len */
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import { ISession } from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { AbstractTable } from '../../tables';
import { ExtractModel, ExtractUpdateModel } from '../../tables/inferTypes';
import Update from '../lowLvlBuilders/updates/update';
import { combine, set } from '../requestBuilders/updates/static';
import { UpdateCustomExpr, UpdateExpr } from '../requestBuilders/updates/updates';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';

export default class UpdateTRB<TTable extends AbstractTable<TTable>, TPartial extends {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, TTable>} = {}>
  extends TableRequestBuilder<TTable, TPartial> {
  private _filter: Expr;
  private _update: UpdateExpr;
  private _objToUpdate: Partial<ExtractModel<TTable>>;

  public constructor(
    table: AbstractTable<TTable>,
    session: ISession,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    logger?: BaseLogger,
  ) {
    super(table, session, mappedServiceToDb, logger);
  }

  public where = (expr: Expr): UpdateTRB<TTable> => {
    this._filter = expr;
    return this;
  };

  public set = (expr: Partial<ExtractUpdateModel<TTable>>): UpdateTRB<TTable> => {
    const updates: Array<UpdateExpr> = [];
    Object.entries(expr).forEach(([key, value]) => {
      const column = this._mappedServiceToDb[key as keyof ExtractModel<TTable>];
      if (value instanceof UpdateCustomExpr) {
        value.setColumn(column);
        updates.push(value);
      } else {
        updates.push(set(column, value as any));
      }
    });
    this._update = combine(updates);

    return this;
  };

  public execute = async () => {
    await this._execute();
  };

  protected _execute = async (): Promise<Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>>> => {
    let query = '';
    let values = [];

    try {
      const builderResult = Update.in(this._table)
        .columns()
        .set(this._update)
        .filteredBy(this._filter)
        .build();
      query = builderResult.query;
      values = builderResult.values;
    } catch (e: any) {
      throw new BuilderError(BuilderType.UPDATE, this._table.tableName(),
        this._columns, e, this._session, this._filter);
    }

    if (this._logger) {
      this._logger.info(`Updating ${this._table.tableName()} using query:\n ${query}`);
      this._logger.info(`Values used for update:\n ${values}`);
    }
    const result = await this._session.execute(query, values);
    return QueryResponseMapper.map(this._mappedServiceToDb, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>>;
  };
}
