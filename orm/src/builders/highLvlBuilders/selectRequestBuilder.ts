/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/member-ordering */
/* eslint-disable import/no-cycle */
import { QueryResult } from 'pg';
import { JoinWith, Select } from '..';
import { AbstractColumn } from '../../columns/column';
import ColumnType from '../../columns/types/columnType';
import DB from '../../db/db';
import { ISession } from '../../db/session';
import BuilderError, { BuilderType } from '../../errors/builderError';
import BaseLogger from '../../logger/abstractLogger';
import QueryResponseMapper from '../../mappers/responseMapper';
import { AbstractTable } from '../../tables';
import { ExtractModel, ExtractPartialObjectFromColumns, PartialFor } from '../../tables/inferTypes';
import SelectTRBWithJoin from '../joinBuilders/builders/selectWithJoin';
import { JoinStrategy } from '../joinBuilders/join';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';
import Order from './order';

export default class SelectTRB<TTable extends AbstractTable<TTable>, TPartial extends {[name: string]: AbstractColumn<ColumnType<any>, boolean, boolean, TTable>} = {}>
  extends TableRequestBuilder<TTable, TPartial> {
  protected _filter: Expr;
  private props: { limit?: number, offset?: number};
  private __orderBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __groupBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __order?: Order;
  private __distinct: AbstractColumn<ColumnType, boolean, boolean>;
  private __partial?: TPartial;

  public constructor(
    session: ISession,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    props: {limit?:number, offset?:number},
    table: AbstractTable<TTable>,
    logger?: BaseLogger,
    partial?: TPartial,
  ) {
    super(table, session, mappedServiceToDb, logger);
    this.props = props;
    this.__partial = partial;
  }

  public where = (expr: Expr): SelectTRB<TTable, TPartial> => {
    this._filter = expr;
    return this;
  };

  public orderBy<TColumnType extends ColumnType>(
    callback: (table: TTable) => AbstractColumn<TColumnType, boolean, boolean>,
    order: Order,
  )
    : SelectTRB<TTable, TPartial> {
    this.__orderBy = callback(this._table);
    this.__order = order;
    return this;
  }

  public distinct = (column: AbstractColumn<ColumnType<any>, boolean, boolean>)
  : SelectTRB<TTable, TPartial> => {
    this.__distinct = column;
    return this;
  };

  public limit = (limit: number): SelectTRB<TTable, TPartial> => {
    this.props.limit = limit;
    return this;
  };

  public offset = (offset: number): SelectTRB<TTable, TPartial> => {
    this.props.offset = offset;
    return this;
  };

  // public groupBy(callback: (table: TTable) => Column<ColumnType, boolean, boolean>)
  //   : SelectTRB<TTable> {
  //   this.__groupBy = callback(this.__table);
  //   return this;
  // }

  public innerJoin<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial, IToPartial> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.INNER_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
      this.__distinct,
      this.__partial,
      partial,
      this._logger,
    );
  }

  public leftJoin<TColumn extends ColumnType<any>, IToColumn extends ColumnType<any>, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<IToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial, IToPartial> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.LEFT_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
      this.__distinct,
      this.__partial,
      partial,
      this._logger,
    );
  }

  public rightJoin<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial, IToPartial> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.RIGHT_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
      this.__distinct,
      this.__partial,
      partial,
      this._logger,
    );
  }

  public fullJoin<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable ;},
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial, IToPartial> {
    const toTable = this._table.db.create(table);

    const fromColumn = from(this._table);
    const toColumn = to(toTable);

    const join = new JoinWith(toTable.tableName(), toTable.mapServiceToDb())
      .columns(fromColumn, toColumn).joinStrategy(JoinStrategy.FULL_JOIN);

    return new SelectTRBWithJoin(
      this._table,
      this._session,
      this._filter,
      join,
      this.props,
      this.__orderBy,
      this.__order,
      this.__distinct,
      this.__partial,
      partial,
      this._logger,
    );
  }

  public execute = async () => {
    const res = await this._execute();
    return res;
  };

  protected _execute = async (): Promise<Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>>> => {
    // Select.from().filteredBy().limit().offset().orderBy().groupBy().build()
    const queryBuilder = Select
      .from(this._table, this.__partial)
      .distinct(this.__distinct)
      .filteredBy(this._filter)
      .limit(this.props.limit)
      .offset(this.props.offset)
      .orderBy(this.__orderBy, this.__order!);

    let query = '';
    let values = [];
    try {
      const builderResult = queryBuilder.build();
      query = builderResult.query;
      values = builderResult.values;
    } catch (e: any) {
      throw new BuilderError(BuilderType.SELECT, this._table.tableName(),
        this._columns, e, this._session, this._filter);
    }

    if (this._logger) {
      this._logger.info(`Selecting from ${this._table.tableName()} using query:\n ${query}`);
      this._logger.info(`Values for query:\n ${values}`);
    }
    const result = await this._session.execute(query, values);
    if (this.__partial) {
      return QueryResponseMapper.partialMap(this.__partial, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>>;
    }
    return QueryResponseMapper.map(this._mappedServiceToDb, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable>: ExtractModel<TPartial>>;
  };
}
