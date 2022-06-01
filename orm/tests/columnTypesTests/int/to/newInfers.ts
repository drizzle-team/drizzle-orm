/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable no-tabs */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable max-classes-per-file */
class Table<T extends object, TName extends string> {
  constructor(public name: TName, public fields: T) {}
}

type InferJoins<
	TNames extends string,
	T extends { [K in TNames]: Table<any, K> },
> = {
  [K in TNames]: T[TNames];
};

type InferTableName<T> = T extends Table<any, infer TName> ? TName : never;

type InferColumns<T> = T extends Table<infer TColumns, any> ? TColumns : never;

class Query<TJoins extends { [k: string]: any }> {
  private constructor(joins: TJoins) {}

  static create<TTable extends Table<any, any>, TName extends InferTableName<TTable>>(value: TTable)
    : Query<{ [K in TName]: InferColumns<TTable> }> {
    return new Query({ [value.name]: value.fields }) as Query<{
      [K in TName]: InferColumns<TTable>;
    }>;
  }

  join<TTable extends Table<any, any>, TName extends string>(
    value: TTable,
    name: TName,
    on: (joins: TJoins & { [K in TName]: InferColumns<TTable> }) => any,
  ): Query<TJoins & { [K in TName]: InferColumns<TTable> }>;
  join<TTable extends Table<any, any>, TName extends InferTableName<TTable>>(
    value: TTable,
    on: (joins: TJoins & { [K in TName]: InferColumns<TTable> }) => any,
  ): Query<TJoins & { [K in TName]: InferColumns<TTable> }>;
  join<TTable extends Table<any, any>, TName extends InferTableName<TTable>>(
    value: TTable,
    onOrName: TName | ((joins: TJoins & { [K in TName]: InferColumns<TTable> }) => any),
    onOptional?: (
      joins: TJoins & { [K in TName]: InferColumns<TTable> },
    ) => any,
  ): Query<TJoins & { [K in TName]: InferColumns<TTable> }> {
    let name;
    let on;
    if (typeof onOrName === 'string') {
      name = onOrName;
      on = onOptional;
    } else {
      name = value.name;
      on = onOrName;
    }

    return this;
  }
}

const t1 = new Table('users_table', {
  foo: 'qwe',
  bar: true,
});

const t2 = new Table('t2', {
  baz: 1,
  zxc: {
    foo: 'bar',
  },
});

const t3 = new Table('t2', {
  asd: 1,
  bnm: true,
});

type InferParamName<T>
	= keyof {[Key in keyof T]: T[Key] extends Table<any, any> ? Key : never };

const gfd = { t1 };

type fg = InferParamName<typeof gfd>;
type fg1 = InferTableName<typeof t1>;

const q = Query.create(t1)
  .join(t2, (joins) => `${joins.users_table.bar} ${joins.t2.zxc}`)
  .join(
    t2,
    't2Alias',
    (joins) => `${joins.t2Alias.baz} ${joins.t1_name.foo} ${joins.t2.zxc}`,
  )
  .join(
    t1,
    't1Alias',
    (joins) => `${joins.t2Alias} ${joins.t1_name.bar} ${joins.t2.baz} ${joins.t1Alias.foo}`,
  );
