/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
import DB from '../db/db';
import { AbstractTable } from '../tables';
import ColumnType from './types/columnType';

type ExtractColumnType<T extends ColumnType> =
 T extends ColumnType<infer TCodeType> ?
   TCodeType
   : never;

type OnConstraint = OnDelete | OnUpdate;

export enum OnDelete {
  RESTRICT,
  CASCADE,
}

export enum OnUpdate {
  RESTRICT,
  CASCADE,
}

// eslint-disable-next-line max-len
export abstract class AbstractColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false> {
  public isNullableFlag: TNullable;
  public autoIncrementType: TAutoIncrement;
  public primaryKeyName?: string;
  public uniqueKeyName?: string;

  protected onConstraint?: OnConstraint;
  protected parent: AbstractTable<any>;

  protected parentTableName: string;
  protected columnType: T;
  protected columnName: string;
  protected autoIncrementFlag: boolean = false;
  protected defaultParam: any = null;
  protected referenced: AbstractColumn<T, boolean, boolean>;

  public constructor(parent: AbstractTable<any>, columnName: string,
    columnType: T, nullable: TNullable) {
    this.columnType = columnType;
    this.columnName = columnName;
    this.parentTableName = parent.tableName();
    this.parent = parent;
    this.isNullableFlag = nullable;
  }

  public getAlias = (): string => `${this.parentTableName.replace('.', '_')}_${this.columnName}`;

  public getParent = (): AbstractTable<any> => this.parent;

  public getParentName = (): string => this.parentTableName;

  public abstract foreignKey <ITable extends AbstractTable<ITable>>(table: { new(db: DB): ITable ;},
    callback: (table: ITable) => AbstractColumn<T, boolean, boolean>,
    onConstraint?: OnConstraint)
  : AbstractColumn<T, TNullable, TAutoIncrement>;

  public defaultValue = (value: ExtractColumnType<T>) => {
    this.defaultParam = value;
    return this;
  };

  public abstract autoIncrement(): AbstractColumn<T, boolean, boolean>;

  public abstract primaryKey(): AbstractColumn<T, boolean, boolean>;

  public abstract serial(): AbstractColumn<T, boolean, boolean>;

  public unique = () => {
    this.uniqueKeyName = this.columnName;
    return this;
  };

  public isAutoIncrement = (): boolean => this.autoIncrementFlag;

  public getColumnName = (): string => this.columnName;

  public getReferenced = (): AbstractColumn<T, boolean, boolean> => this.referenced;

  public getColumnType = (): T => this.columnType;

  public getDefaultValue = (): any => this.defaultParam;
}

// eslint-disable-next-line max-len
export class Column<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false>
  extends AbstractColumn<T, TNullable, TAutoIncrement> {
  public constructor(parent: AbstractTable<any>, columnName: string,
    columnType: T, nullable: TNullable) {
    super(parent, columnName, columnType, nullable);
  }

  public serial() {
    this.autoIncrementFlag = true;
    return this as unknown as Column<T, false, true>;
  }

  public primaryKey() {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    // eslint-disable-next-line max-len
    return this as unknown as Column<T, TAutoIncrement extends true ? true : false, TAutoIncrement>;
  }

  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => Column<T, boolean, boolean>,
    onConstraint?: OnConstraint,
  ): Column<T, TNullable, TAutoIncrement> {
    const tableInstance = this.getParent().db.create(table);
    this.referenced = callback(tableInstance);
    this.onConstraint = onConstraint;
    return this;
  }

  public autoIncrement() {
    this.autoIncrementFlag = true;
    return this as unknown as IndexedColumn<T, true, true>;
  }
}

// eslint-disable-next-line max-len
export class IndexedColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false> extends AbstractColumn<T, TNullable, TAutoIncrement> {
  public constructor(parent: AbstractTable<any>, columnName: string,
    columnType: T, nullable: TNullable) {
    super(parent, columnName, columnType, nullable);
  }

  public serial() {
    this.autoIncrementFlag = true;
    return this as unknown as IndexedColumn<T, false, true>;
  }

  public primaryKey() {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    // eslint-disable-next-line max-len
    return this as unknown as IndexedColumn<T, TAutoIncrement extends true ? true : false, TAutoIncrement>;
  }

  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => IndexedColumn<T, boolean, boolean>,
    onConstraint?: OnConstraint,
  ): IndexedColumn<T, TNullable, TAutoIncrement> {
    // eslint-disable-next-line new-cap
    this.referenced = callback(this.getParent().db.create(table));
    this.onConstraint = onConstraint;
    return this;
  }

  public autoIncrement() {
    this.autoIncrementFlag = true;
    return this as unknown as IndexedColumn<T, true, true>;
  }
}
