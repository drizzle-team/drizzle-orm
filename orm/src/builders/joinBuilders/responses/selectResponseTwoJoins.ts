/* eslint-disable max-len */
import AbstractTable from '../../../tables/abstractTable';
import { FullOrPartial, PartialFor } from '../../../tables/inferTypes';

export default class SelectResponseTwoJoins<T1 extends AbstractTable<T1>, T2 extends AbstractTable<T2>, T3 extends AbstractTable<T3>,
  TPartial1 extends PartialFor<T1>, TPartial2 extends PartialFor<T2>, TPartial3 extends PartialFor<T3>> {
  private _t1: Array<FullOrPartial<T1, TPartial1>>;
  private _t2: Array<FullOrPartial<T2, TPartial2>>;
  private _t3: Array<FullOrPartial<T3, TPartial3>>;

  public constructor(t1: Array<FullOrPartial<T1, TPartial1>>,
    t2: Array<FullOrPartial<T2, TPartial2>>,
    t3: Array<FullOrPartial<T3, TPartial3>>) {
    this._t1 = t1;
    this._t2 = t2;
    this._t3 = t3;
  }

  public map = <M>(imac: (t1: FullOrPartial<T1, TPartial1>,
    t2: FullOrPartial<T2, TPartial2>,
    t3: FullOrPartial<T3, TPartial3>) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(imac(this._t1[i], this._t2[i], this._t3[i]));
    }
    return objects;
  };

  public foreach = (imac: (t1: FullOrPartial<T1, TPartial1>,
    t2: FullOrPartial<T2, TPartial2>,
    t3: FullOrPartial<T3, TPartial3>) => void): void => {
    for (let i = 0; i < this._t1.length; i += 1) {
      imac(this._t1[i], this._t2[i], this._t3[i]);
    }
  };

  public group = <TOne, TMany>({
    one,
    many,
  }:{
    one: (t1: FullOrPartial<T1, TPartial1>,
      t2: FullOrPartial<T2, TPartial2>,
      t3: FullOrPartial<T3, TPartial3>) => TOne,
    many: (t1: FullOrPartial<T1, TPartial1>,
      t2: FullOrPartial<T2, TPartial2>,
      t3: FullOrPartial<T3, TPartial3>) => TMany
  }) => {
    const objects = new Array<TMany>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(many(this._t1[i], this._t2[i], this._t3[i]));
    }
    return {
      one: one(this._t1[0], this._t2[0], this._t3[0]),
      many: objects,
    };
  };
}
