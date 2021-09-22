/* eslint-disable import/export */
import Type from '../../types/type';
import { ERoles } from '../testEnum';

export default class RolesType extends Type<ERoles> {
  public type: object = ERoles;

  public alias(): string {
    return 'roles';
  }
}
