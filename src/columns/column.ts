/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable max-len */
/* eslint-disable max-classes-per-file */
import { PgTime, PgTimestamp } from '.';
import DB from '../db/db';
import { AbstractTable } from '../tables';
import { shouldEcranate } from '../utils/ecranate';
import ColumnType from './types/columnType';
import PgTimestamptz from './types/pgTimestamptz';

export enum Defaults {
  CURRENT_TIMESTAMP = 'CURRENT_TIMESTAMP',
}

type PgTimes = PgTimestamptz | PgTime | PgTimestamp;

export type ExtractColumnType<T extends ColumnType> =
 T extends ColumnType<infer TCodeType> ?
   T extends PgTimes ? TCodeType | Defaults : TCodeType
   : never;

// eslint-disable-next-line max-len
export abstract class AbstractColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any> {
  public isNullableFlag: boolean = true;
  public primaryKeyName?: string;
  public uniqueKeyName?: string;

  protected onDelete?: string;
  protected onUpdate?: string;
  protected parent: TParent;

  protected parentTableName: string;
  protected columnType: T;
  protected columnName: string;
  protected defaultParam: any = null;
  protected referenced: AbstractColumn<T, boolean, boolean, TParent>;

  public constructor(parent: TParent, columnName: string,
    columnType: T) {
    this.columnType = columnType;
    this.columnName = columnName;
    this.parentTableName = parent.tableName();
    this.parent = parent;
  }

  public getOnDelete = (): string | undefined => this.onDelete;
  public getOnUpdate = (): string | undefined => this.onUpdate;

  public getAlias = (): string => `${this.parentTableName.replace('.', '_')}_${this.columnName}`;

  public getParent = (): AbstractTable<any> => this.parent;

  public getParentName = (): string => this.parentTableName;

  public abstract foreignKey <ITable extends AbstractTable<ITable>>(table: { new(db: DB): ITable ;},
    callback: (table: ITable) => AbstractColumn<T, boolean, boolean, TParent>,
    onConstraint: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    })
  : AbstractColumn<T, TNullable, TAutoIncrement>;

  public defaultValue = (value: ExtractColumnType<T>) => {
    if (Defaults[value as Defaults] !== undefined) {
      this.defaultParam = value;
    } else if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'bigint') {
      this.defaultParam = value;
    } else {
      this.defaultParam = `'${value}'`;
    }
    return this;
  };

  public abstract primaryKey(): AbstractColumn<T, boolean, boolean, TParent>;

  public unique = () => {
    this.uniqueKeyName = this.columnName;
    return this;
  };

  public abstract notNull(): AbstractColumn<T, boolean, boolean, TParent>;

  public getColumnName = (): string => this.columnName;

  public getReferenced = (): AbstractColumn<T, boolean, boolean, TParent> => this.referenced;

  public getColumnType = (): T => this.columnType;

  public getDefaultValue = (): any => this.defaultParam;
}

// eslint-disable-next-line max-len
export class Column<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any>
  extends AbstractColumn<T, TNullable, TAutoIncrement, TParent> {
  public constructor(parent: TParent, columnName: string,
    columnType: T) {
    super(parent, columnName, columnType);
  }

  public notNull(): Column<T, TAutoIncrement extends true ? true : TNullable extends true ? false : true, TAutoIncrement, TParent> {
    this.isNullableFlag = false;
    return this as Column<T, TAutoIncrement extends true ? true : TNullable extends true ? false : true, TAutoIncrement, TParent>;
  }

  public primaryKey(): Column<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent> {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    return this as Column<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent>;
  }

  public foreignKey(
    table: new (db: DB) => TParent,
    callback: (table: this) => Column<T, boolean, boolean, TParent>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): Column<T, TNullable, TAutoIncrement, TParent>;
  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => Column<T, boolean, boolean, ITable>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): Column<T, TNullable, TAutoIncrement, TParent>;
  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => any,
    callback: (table: any) => Column<T, boolean, boolean, any>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ) {
    let tableInstance: ITable;
    // eslint-disable-next-line new-cap
    if (typeof this !== typeof this.getParent()) {
      tableInstance = this.getParent().db.create(table);
    } else {
      tableInstance = this as unknown as ITable;
    }
    this.referenced = callback(tableInstance);
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }
}

// eslint-disable-next-line max-len
export class IndexedColumn<T extends ColumnType, TNullable extends boolean = true, TAutoIncrement extends boolean = false, TParent extends AbstractTable<any> = any> extends AbstractColumn<T, TNullable, TAutoIncrement, TParent> {
  public constructor(parent: TParent, columnName: string,
    columnType: T, nullable: TNullable) {
    super(parent, columnName, columnType);
  }

  public notNull(): IndexedColumn<T, TAutoIncrement extends true ? true : TNullable extends true? false : true, TAutoIncrement, TParent> {
    this.isNullableFlag = false;
    return this as IndexedColumn<T, TAutoIncrement extends true ? true : TNullable extends true? false : true, TAutoIncrement, TParent>;
  }

  public primaryKey(): IndexedColumn<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent> {
    this.primaryKeyName = `${this.parentTableName}_${this.columnName}`;
    // eslint-disable-next-line max-len
    return this as IndexedColumn<T, TAutoIncrement extends true ? true : false, TAutoIncrement, TParent>;
  }

  public foreignKey<ITable extends AbstractTable<ITable>>(
    table: new (db: DB) => ITable,
    callback: (table: ITable) => IndexedColumn<T, boolean, boolean, TParent>,
    onConstraint?: {
      onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT',
      onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'SET DEFAULT'
    },
  ): IndexedColumn<T, TNullable, TAutoIncrement, TParent> {
    // eslint-disable-next-line new-cap
    this.referenced = callback(this.getParent().db.create(table));
    this.onDelete = onConstraint?.onDelete ? `ON DELETE ${onConstraint.onDelete}` : undefined;
    this.onUpdate = onConstraint?.onUpdate ? `ON UPDATE ${onConstraint.onUpdate}` : undefined;
    return this;
  }
}
