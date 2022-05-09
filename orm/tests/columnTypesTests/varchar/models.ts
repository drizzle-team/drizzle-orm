/* eslint-disable import/prefer-default-export */
import { ExtractModel } from '@/tables';
import AllVarcharsTable from './to/allVarcharsTable';

export const allPositiveFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple@gmail.com',
  simpleVarchar: 's`imple',
  notNullVarchar: 'deer',
  varcharWithDefault: 'undefined',
  notNullVarcharWithDefault: 'name@',
  uniqueVarchar: 'unique_varchar',
  notNullUniqueVarchar: 'dsc',

};

export const mixedFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple@gmail.com',
  simpleVarchar: 's`imple',
  notNullVarchar: 'deer',
  varcharWithDefault: undefined,
  notNullVarcharWithDefault: 'name@',
  uniqueVarchar: 'unique_varchar',
  notNullUniqueVarchar: 'dsc',

};
