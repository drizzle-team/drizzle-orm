/* eslint-disable max-len */
import AbstractTable from '../../../tables/abstractTable';
import { FullOrPartial, PartialFor } from '../../../tables/inferTypes';

export default class SelectResponseJoin<TTable1 extends AbstractTable<TTable1>, TTable2 extends AbstractTable<TTable2>, TPartial1 extends PartialFor<TTable1>, TPartial2 extends PartialFor<TTable2>> {
  private _t1: Array<FullOrPartial<TTable1, TPartial1> | undefined>;
  private _t2: Array<FullOrPartial<TTable2, TPartial2> | undefined>;

  public constructor(t1: Array<FullOrPartial<TTable1, TPartial1> | undefined>,
    t2: Array<FullOrPartial<TTable2, TPartial2> | undefined>) {
    this._t1 = t1;
    this._t2 = t2;
  }

  public map = <M>(imac: (t1: FullOrPartial<TTable1, TPartial1> | undefined,
    t2: FullOrPartial<TTable2, TPartial2> | undefined) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(imac(this._t1[i], this._t2[i]));
    }
    return objects;
  };

  public foreach = (imac: (t1: FullOrPartial<TTable1, TPartial1> | undefined,
    t2: FullOrPartial<TTable2, TPartial2> | undefined) => void): void => {
    for (let i = 0; i < this._t1.length; i += 1) {
      imac(this._t1[i], this._t2[i]);
    }
  };

  public group = <TOne, TMany>({
    one,
    many,
  }:{
    one: (t1: FullOrPartial<TTable1, TPartial1> | undefined,
      t2: FullOrPartial<TTable2, TPartial2> | undefined) => TOne,
    many: (t1: FullOrPartial<TTable1, TPartial1> | undefined,
      t2: FullOrPartial<TTable2, TPartial2> | undefined) => TMany
  }) => {
    const objects = new Array<TMany>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(many(this._t1[i], this._t2[i]));
    }
    return {
      one: one(this._t1[0], this._t2[0]),
      many: objects,
    };
  };
}
