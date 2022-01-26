/* eslint-disable max-len */
import AbstractTable from '../../../tables/abstractTable';
import { FullOrPartial, PartialFor } from '../../../tables/inferTypes';

export default class SelectResponseFiveJoins<T1 extends AbstractTable<T1>, T2 extends AbstractTable<T2>, T3 extends AbstractTable<T3>, T4 extends AbstractTable<T4>, T5 extends AbstractTable<T5>, T6 extends AbstractTable<T6>,
TPartial1 extends PartialFor<T1>, TPartial2 extends PartialFor<T2>, TPartial3 extends PartialFor<T3>, TPartial4 extends PartialFor<T4>, TPartial5 extends PartialFor<T5>, TPartial6 extends PartialFor<T6>> {
  public _t1: Array<FullOrPartial<T1, TPartial1> | undefined>;
  public _t2: Array<FullOrPartial<T2, TPartial2> | undefined>;
  public _t3: Array<FullOrPartial<T3, TPartial3> | undefined>;
  public _t4: Array<FullOrPartial<T4, TPartial4> | undefined>;
  public _t5: Array<FullOrPartial<T5, TPartial5> | undefined>;
  public _t6: Array<FullOrPartial<T6, TPartial6> | undefined>;

  public constructor(
    t1: Array<FullOrPartial<T1, TPartial1> | undefined>,
    t2: Array<FullOrPartial<T2, TPartial2> | undefined>,
    t3: Array<FullOrPartial<T3, TPartial3> | undefined>,
    t4: Array<FullOrPartial<T4, TPartial4> | undefined>,
    t5: Array<FullOrPartial<T5, TPartial5> | undefined>,
    t6: Array<FullOrPartial<T6, TPartial6> | undefined>,
  ) {
    this._t1 = t1;
    this._t2 = t2;
    this._t3 = t3;
    this._t4 = t4;
    this._t5 = t5;
    this._t6 = t6;
  }

  public map = <M>(imac: (t1: FullOrPartial<T1, TPartial1> | undefined,
    t2: FullOrPartial<T2, TPartial2> | undefined,
    t3: FullOrPartial<T3, TPartial3> | undefined,
    t4: FullOrPartial<T4, TPartial4> | undefined,
    t5: FullOrPartial<T5, TPartial5> | undefined,
    t6: FullOrPartial<T6, TPartial6> | undefined) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(imac(this._t1[i], this._t2[i], this._t3[i],
        this._t4[i], this._t5[i], this._t6[i]));
    }
    return objects;
  };

  public foreach = (imac: (t1: FullOrPartial<T1, TPartial1> | undefined,
    t2: FullOrPartial<T2, TPartial2> | undefined,
    t3: FullOrPartial<T3, TPartial3> | undefined,
    t4: FullOrPartial<T4, TPartial4> | undefined,
    t5: FullOrPartial<T5, TPartial5> | undefined,
    t6: FullOrPartial<T6, TPartial6> | undefined) => void): void => {
    for (let i = 0; i < this._t1.length; i += 1) {
      imac(this._t1[i], this._t2[i], this._t3[i], this._t4[i], this._t5[i], this._t6[i]);
    }
  };

  public group = <TOne, TMany>({
    one,
    many,
  }:{
    one: (t1: FullOrPartial<T1, TPartial1> | undefined,
      t2: FullOrPartial<T2, TPartial2> | undefined,
      t3: FullOrPartial<T3, TPartial3> | undefined,
      t4: FullOrPartial<T4, TPartial4> | undefined,
      t5: FullOrPartial<T5, TPartial5> | undefined,
      t6: FullOrPartial<T6, TPartial6> | undefined) => TOne,
    many: (t1: FullOrPartial<T1, TPartial1> | undefined,
      t2: FullOrPartial<T2, TPartial2> | undefined,
      t3: FullOrPartial<T3, TPartial3> | undefined,
      t4: FullOrPartial<T4, TPartial4> | undefined,
      t5: FullOrPartial<T5, TPartial5> | undefined,
      t6: FullOrPartial<T6, TPartial6> | undefined) => TMany
  }) => {
    const objects = new Array<TMany>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(many(this._t1[i], this._t2[i], this._t3[i],
        this._t4[i], this._t5[i], this._t6[i]));
    }
    return {
      one: one(this._t1[0], this._t2[0], this._t3[0], this._t4[0], this._t5[0], this._t6[0]),
      many: objects,
    };
  };
}
