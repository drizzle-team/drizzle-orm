/* eslint-disable import/no-cycle */
/* eslint-disable no-restricted-syntax */
/* eslint-disable max-len */
import { ExtractPartialObjectFromColumns, FullOrPartial, PartialFor } from '../../../tables/inferTypes';
import AbstractTable from '../../../tables/abstractTable';
import QueryResponseMapper from '../../../mappers/responseMapper';
import BaseLogger from '../../../logger/abstractLogger';
import BuilderError, { BuilderType } from '../../../errors/builderError';
import ColumnType from '../../../columns/types/columnType';
import { AbstractColumn } from '../../../columns/column';
import Select from '../../lowLvlBuilders/selects/select';
import Expr from '../../requestBuilders/where/where';
import Order from '../order';
import JoinBuilderResponses from './joinBuilderResponse';
import { JoinedColumn, JoinedHandler } from './proxies/joinProxies';

export interface JoinType<T extends AbstractTable<T>> {
  table: string;
  columns: ExtractPartialObjectFromColumns<T>;
  onExpression: Expr;
  type: string;
  originalName: string;
}

export type TableIfPartialIsUndefined<TPartial, TJoinedTableMapped>
 = TPartial extends undefined ? TJoinedTableMapped: TPartial;

export type EmptyPartial<T extends AbstractTable<T>> = PartialFor<T> | undefined;

export default class JoinBuilder<TJoins extends {[name: string]: any}[],
    TJoinsResponses extends FullOrPartial<AbstractTable<any>, any>[]> {
  private joinedTables: JoinType<AbstractTable<any>>[] = [];
  private joinResponses: TJoinsResponses;

  public constructor(
    private joins: TJoins,
    onTableOriginalName: string,
    private aliasCounter: number,
    onExpression: Expr,
    onTable: AbstractTable<any>,
    type: string,
    private rootTable: AbstractTable<any>,
    private _filter: Expr,
    private _props: { limit?: number, offset?: number },
    private _orderBy?: AbstractColumn<ColumnType, boolean, boolean>,
    private _order?: Order,
    private _distinct?: AbstractColumn<ColumnType, boolean, boolean>,
    private _partial?: any,
    private _logger?: BaseLogger,
  ) {
    this.joinedTables.push({
      table: onTable.tableName(),
      columns: joins[1],
      originalName: onTableOriginalName,
      onExpression,
      type,
    });
  }

  public innerJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TPartial,
  ): JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]> {
    return this.join(value, callback, 'INNER JOIN', partial);
  }

  public leftJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TPartial,
  ): JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]> {
    return this.join(value, callback, 'LEFT JOIN', partial);
  }

  public rightJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TPartial,
  ): JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]> {
    return this.join(value, callback, 'RIGHT JOIN', partial);
  }

  public fullJoin<TJoinedTable extends AbstractTable<TJoinedTable>, TPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    partial?: TPartial,
  ): JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]> {
    return this.join(value, callback, 'FULL JOIN', partial);
  }

  public where = (callback: (...args: [...TJoins]) => Expr): this => {
    this._filter = callback(...this.joins);
    return this;
  };

  public async execute(): Promise<JoinBuilderResponses<TJoinsResponses>> {
    const queryBuilder = Select
      .from(this.rootTable, this._partial)
      .distinct(this._distinct)
      .joined(this.joinedTables)
      .limit(this._props.limit)
      .offset(this._props.offset)
      .filteredBy(this._filter)
      .orderBy(this._orderBy, this._order);

    let query = '';
    let values = [];
    try {
      const builderResult = queryBuilder.build();
      query = builderResult.query;
      values = builderResult.values;
    } catch (e: any) {
      throw new BuilderError(BuilderType.JOINED_SELECT,
        this.rootTable.tableName(), Object.values(this.rootTable.mapServiceToDb()), e, this.rootTable.db.session(), this._filter);
    }

    if (this._logger) {
      this._logger.info(`Selecting from ${this.rootTable.tableName()} using query:\n ${query}`);
      this._logger.info(`Values for query:\n ${values}`);
    }

    const result = await this.rootTable.db.session().execute(query, values);

    const mappedResponse = this.joins.map((joinedTable) => QueryResponseMapper.map(joinedTable, result) as Array<FullOrPartial<AbstractTable<any>, PartialFor<any>>>);

    return new JoinBuilderResponses<TJoinsResponses>(mappedResponse as TJoinsResponses[]);
  }

  private join<TJoinedTable extends AbstractTable<TJoinedTable>, TPartial extends EmptyPartial<TJoinedTable> = undefined>(
    value: TJoinedTable,
    callback: (...args: [...TJoins, TableIfPartialIsUndefined<TPartial,
    ExtractPartialObjectFromColumns<TJoinedTable>>]) => Expr,
    joinType: string,
    partial?: TPartial,
  ): JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>],
    [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]> {
    this.aliasCounter += 1;

    const valueAsProxy = new Proxy(value, new JoinedHandler(this.aliasCounter));

    if (partial) {
      for (const key of Object.keys(partial!)) {
        // eslint-disable-next-line no-param-reassign
        (partial as PartialFor<TJoinedTable>)[key as keyof PartialFor<TJoinedTable>] = new Proxy(partial[key], new JoinedColumn(value, this.aliasCounter));
      }
    }

    const obj = partial ? partial as TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>
      : valueAsProxy.mapServiceToDb() as TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>;

    const onExpression = callback(...this.joins, obj);
    this.joins.push(partial ?? valueAsProxy.mapServiceToDb());

    this.joinedTables.push({
      table: valueAsProxy.tableName(), columns: obj, originalName: value.tableName(), onExpression, type: joinType,
    });

    return this as unknown as JoinBuilder<[...TJoins, TableIfPartialIsUndefined<TPartial, ExtractPartialObjectFromColumns<TJoinedTable>>], [...TJoinsResponses, FullOrPartial<TJoinedTable, TPartial>]>;
  }
}
