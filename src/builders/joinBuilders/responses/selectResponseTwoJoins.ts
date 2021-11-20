import { ExtractModel } from '../../../tables/inferTypes';

export default class SelectResponseTwoJoins<T1, T2, T3> {
  private _t1: Array<ExtractModel<T1> | undefined>;
  private _t2: Array<ExtractModel<T2> | undefined>;
  private _t3: Array<ExtractModel<T3> | undefined>;

  public constructor(t1: Array<ExtractModel<T1> | undefined>,
    t2: Array<ExtractModel<T2> | undefined>,
    t3: Array<ExtractModel<T3> | undefined>) {
    this._t1 = t1;
    this._t2 = t2;
    this._t3 = t3;
  }

  public map = <M>(imac: (t1: ExtractModel<T1> | undefined,
    t2: ExtractModel<T2> | undefined,
    t3: ExtractModel<T3> | undefined) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(imac(this._t1[i], this._t2[i], this._t3[i]));
    }
    return objects;
  };

  public foreach = (imac: (t1: ExtractModel<T1> | undefined,
    t2: ExtractModel<T2> | undefined,
    t3: ExtractModel<T3> | undefined) => void): void => {
    for (let i = 0; i < this._t1.length; i += 1) {
      imac(this._t1[i], this._t2[i], this._t3[i]);
    }
  };

  public group = <TOne, TMany>({
    one,
    many,
  }:{
    one: (t1: ExtractModel<T1> | undefined,
      t2: ExtractModel<T2> | undefined,
      t3: ExtractModel<T3> | undefined) => TOne,
    many: (t1: ExtractModel<T1> | undefined,
      t2: ExtractModel<T2> | undefined,
      t3: ExtractModel<T3> | undefined) => TMany
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
