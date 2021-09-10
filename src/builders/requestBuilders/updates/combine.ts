import UpdateExpr from './updates';

export default class Combine extends UpdateExpr {
  private _setters: Array<UpdateExpr>;

  public constructor(setters: Array<UpdateExpr>) {
    super();
    this._setters = setters;
  }

  public toQuery = (): string => {
    const response = [];

    for (let index = 0; index < this._setters.length; index += 1) {
      const setter = this._setters[index];
      response.push(setter.toQuery());

      if (index !== this._setters.length - 1) {
        response.push(', ');
      }
    }

    return response.join('');
  };
}
