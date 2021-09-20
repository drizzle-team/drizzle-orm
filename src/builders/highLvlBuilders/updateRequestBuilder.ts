import { Column } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import Session from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import { DatabaseUpdateError } from '../../errors/dbErrors';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { ExtractModel } from '../../tables/inferTypes';
import Update from '../lowLvlBuilders/updates/update';
import { combine, set } from '../requestBuilders/updates/static';
import UpdateExpr from '../requestBuilders/updates/updates';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';

export default class UpdateTRB<TTable> extends TableRequestBuilder<TTable> {
  private _filter: Expr;
  private _update: UpdateExpr;
  private _objToUpdate: Partial<ExtractModel<TTable>>;

  public constructor(
    tableName: string,
    session: Session,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: Column<ColumnType>; },
    logger?: BaseLogger,
  ) {
    super(tableName, session, mappedServiceToDb, logger);
  }

  public where = (expr: Expr): UpdateTRB<TTable> => {
    this._filter = expr;
    return this;
  };

  public set = (expr: Partial<ExtractModel<TTable>>): UpdateTRB<TTable> => {
    const updates: Array<UpdateExpr> = [];
    Object.entries(expr).forEach(([key, value]) => {
      const column = this._mappedServiceToDb[key as keyof ExtractModel<TTable>];
      updates.push(set(column, value as any));
    });
    this._update = combine(updates);

    return this;
  };

  public execute = async () => {
    await this._execute();
  };

  protected _execute = async (): Promise<Array<ExtractModel<TTable> | undefined>> => {
    let query = '';

    try {
      query = Update.in(this._tableName)
        .columns(this._columns)
        .set(this._update)
        .filteredBy(this._filter)
        .build();
    } catch (e: any) {
      throw new BuilderError(BuilderType.UPDATE, this._tableName, this._columns, e, this._filter);
    }

    if (this._logger) {
      this._logger.info(`Updating ${this._tableName} using query:\n ${query}`);
    }
    const result = await this._session.execute(query);
    if (result.isLeft()) {
      const { reason } = result.value;
      throw new DatabaseUpdateError(this._tableName, reason, query);
    } else {
      return QueryResponseMapper.map(this._mappedServiceToDb, result.value);
    }
  };
}
