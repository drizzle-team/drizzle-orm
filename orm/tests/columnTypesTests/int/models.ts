import { ExtractModel } from '@/tables';
import AllIntsTable from './to/allIntsTable';

export const allPositiveFields: ExtractModel<AllIntsTable> = {
  serialInt: 2,
  primaryInt: 3,
  simpleInt: 4,
  notNullInt: 5,
  intWithDefault: 6,
  notNullIntWithDefault: 7,
  uniqueInt: 8,
  notNullUniqueInt: 9,
};

export const mixedFields: ExtractModel<AllIntsTable> = {
  serialInt: 11,
  primaryInt: 12,
  simpleInt: 13,
  notNullInt: 0,
  intWithDefault: -1,
  notNullIntWithDefault: -2,
  uniqueInt: -3,
  notNullUniqueInt: -4,
};
