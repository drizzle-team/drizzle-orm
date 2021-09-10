import { ExtractModel } from '../../../tables/inferTypes';

export default class SelectResponseJoin<TTable1, TTable2> {
  private _t1: Array<ExtractModel<TTable1> | undefined>;
  private _t2: Array<ExtractModel<TTable2> | undefined>;

  public constructor(t1: Array<ExtractModel<TTable1> | undefined>,
    t2: Array<ExtractModel<TTable2> | undefined>) {
    this._t1 = t1;
    this._t2 = t2;
  }

  public map = <M>(imac: (t1: ExtractModel<TTable1> | undefined,
    t2: ExtractModel<TTable2> | undefined) => M): Array<M> => {
    const objects = new Array<M>();
    for (let i = 0; i < this._t1.length; i += 1) {
      objects.push(imac(this._t1[i], this._t2[i]));
    }
    return objects;
  };
}
