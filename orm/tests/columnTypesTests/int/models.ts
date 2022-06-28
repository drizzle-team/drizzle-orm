import { ExtractModel } from '../../../src/tables/inferTypes';
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

export const updatePositiveFields: ExtractModel<AllIntsTable> = {
  primaryInt: 9,
  serialInt: 8,
  simpleInt: 7,
  notNullInt: 6,
  intWithDefault: 5,
  notNullIntWithDefault: 4,
  uniqueInt: 3,
  notNullUniqueInt: 2,
};
export const updateMixedFields: ExtractModel<AllIntsTable> = {
  primaryInt: -5,
  serialInt: 14,
  simpleInt: -1,
  notNullInt: 7,
  intWithDefault: 2,
  notNullIntWithDefault: 16,
  uniqueInt: -7,
  notNullUniqueInt: -2,
};

export const requiredPositiveFields: ExtractModel<AllIntsTable> = {
  primaryInt: 15,
  notNullInt: 5,
  notNullIntWithDefault: 7,
  notNullUniqueInt: 18,
};

export const requiredMixedFields: ExtractModel<AllIntsTable> = {
  primaryInt: 17,
  notNullInt: 0,
  notNullIntWithDefault: -2,
  notNullUniqueInt: -12,
};

export const differentPositiveFields: ExtractModel<AllIntsTable> = {
  serialInt: 2,
  primaryInt: 15,
  notNullInt: 5,
  notNullIntWithDefault: 7,
  notNullUniqueInt: 18,
};

export const differentMixedFields: ExtractModel<AllIntsTable> = {
  serialInt: 11,
  primaryInt: 17,
  notNullInt: 0,
  notNullIntWithDefault: -2,
  notNullUniqueInt: -12,
};
