/* eslint-disable guard-for-in */
/* eslint-disable no-restricted-syntax */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable max-classes-per-file */
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
import {
  ExtractModel, ExtractPartialObjectFromColumns, FullOrPartial, PartialFor,
} from '../../tables/inferTypes';
import SelectTRBWithJoin from '../joinBuilders/builders/selectWithJoin';
import { JoinStrategy } from '../joinBuilders/join';
import Expr from '../requestBuilders/where/where';
import TableRequestBuilder from './abstractRequestBuilder';
import { JoinedColumn, JoinedHandler } from './joins/proxies/joinProxies';
import JoinBuilder, { EmptyPartial, TableIfPartialIsUndefined } from './joins/selectJoinBuilder';
import Order from './order';

export default class SelectTRB<TTable extends AbstractTable<TTable>, TPartial extends EmptyPartial<TTable> = undefined>
  extends TableRequestBuilder<TTable, TPartial> {
  protected _filter: Expr;
  private props: { limit?: number, offset?: number };
  private __orderBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __groupBy?: AbstractColumn<ColumnType, boolean, boolean>;
  private __order?: Order;
  private __distinct: AbstractColumn<ColumnType, boolean, boolean>;
  private __partial?: TPartial;

  public constructor(
    session: ISession,
    mappedServiceToDb: { [name in keyof ExtractModel<TTable>]: AbstractColumn<ColumnType>; },
    props: { limit?: number, offset?: number },
    table: AbstractTable<TTable>,
    logger?: BaseLogger,
    partial?: TPartial,
  ) {
    super(table, session, mappedServiceToDb, logger);
    this.props = props;
    this.__partial = partial;
  }

  private join<TJoinedTable extends AbstractTable<TJoinedTable>, TJoinedPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    joinType: string,
    partial?: TJoinedPartial,
  ): JoinBuilder<[TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [FullOrPartial<TTable, TPartial>, FullOrPartial<TJoinedTable, TJoinedPartial>]> {
    const valueAsProxy = new Proxy(value, new JoinedHandler(1));

    if (partial) {
      for (const key of Object.keys(partial!)) {
        // eslint-disable-next-line no-param-reassign
        (partial as PartialFor<TJoinedTable>)[key] = new Proxy(partial[key], new JoinedColumn(value, 1));
      }
    }

    const obj = this.__partial ? this.__partial as TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>
      : this._table.mapServiceToDb() as TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>;

    const obj1 = partial ? partial as TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>
      : valueAsProxy.mapServiceToDb() as TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>;

    const joinExpression = callback(obj, obj1);

    return new JoinBuilder(
      [obj, obj1],
      value.tableName(),
      1,
      joinExpression,
      valueAsProxy,
      joinType,
      this._table,
      this._filter,
      this.props,
      this.__orderBy,
      this.__order,
      this.__distinct,
      this.__partial,
      this._logger,
    );
  }

  public innerJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TJoinedPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TJoinedPartial,
  ): JoinBuilder<[TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [FullOrPartial<TTable, TPartial>, FullOrPartial<TJoinedTable, TJoinedPartial>]> {
    return this.join(value, callback, 'INNER JOIN', partial);
  }

  public leftJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TJoinedPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TJoinedPartial,
  ): JoinBuilder<[TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [FullOrPartial<TTable, TPartial>, FullOrPartial<TJoinedTable, TJoinedPartial>]> {
    return this.join(value, callback, 'LEFT JOIN', partial);
  }

  public rightJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TJoinedPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TJoinedPartial,
  ): JoinBuilder<[TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [FullOrPartial<TTable, TPartial>, FullOrPartial<TJoinedTable, TJoinedPartial>]> {
    return this.join(value, callback, 'RIGHT JOIN', partial);
  }

  public fullJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TJoinedPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TJoinedPartial,
  ): JoinBuilder<[TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TTable>>, TableIfPartialIsUndefined<TJoinedPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [FullOrPartial<TTable, TPartial>, FullOrPartial<TJoinedTable, TJoinedPartial>]> {
    return this.join(value, callback, 'FULL JOIN', partial);
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

  /**
  * @deprecated Since version 0.11.0. Will be deleted in version 0.12.0. Use {@link innerJoinV2()} instead
  */
  public innerJoinV1<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable>>(
    table: { new(db: DB): IToTable; },
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial> {
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
    ) as SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial>;
  }

  /**
  * @deprecated Since version 0.11.0. Will be deleted in version 0.12.0. Use {@link leftJoin()} instead
  */
  public leftJoinV1<TColumn extends ColumnType<any>, IToColumn extends ColumnType<any>, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable; },
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean, TTable>,
    to: (table: IToTable) => AbstractColumn<IToColumn, boolean, boolean, IToTable>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial> {
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
    ) as SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial>;
  }

  /**
  * @deprecated Since version 0.11.0. Will be deleted in version 0.12.0. Use {@link rightJoin()} instead
  */
  public rightJoinV1<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable; },
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial> {
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
    ) as SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial>;
  }

  /**
  * @deprecated Since version 0.11.0. Will be deleted in version 0.12.0. Use {@link fullJoin()} instead
  */
  public fullJoinV1<TColumn extends ColumnType, TToColumn extends ColumnType, IToTable extends AbstractTable<IToTable>, IToPartial extends PartialFor<IToTable> = {}>(
    table: { new(db: DB): IToTable; },
    from: (table: TTable) => AbstractColumn<TColumn, boolean, boolean>,
    to: (table: IToTable) => AbstractColumn<TToColumn, boolean, boolean>,
    partial?: IToPartial,
  ): SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial> {
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
    ) as SelectTRBWithJoin<TTable, IToTable, TPartial extends undefined ? {} : TPartial, IToPartial>;
  }

  public execute = async () => {
    const res = await this._execute();
    return res;
  };

  protected _execute = async (): Promise<Array<[keyof TPartial] extends [never] ? ExtractModel<TTable> : ExtractModel<TPartial>>> => {
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
      return QueryResponseMapper.partialMap(this.__partial!, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable> : ExtractModel<TPartial>>;
    }
    return QueryResponseMapper.map(this._mappedServiceToDb, result) as Array<[keyof TPartial] extends [never] ? ExtractModel<TTable> : ExtractModel<TPartial>>;
  };
}
