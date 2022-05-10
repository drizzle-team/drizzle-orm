/* eslint-disable import/prefer-default-export */
import { ExtractModel } from '@/tables';
import AllVarcharsTable from './to/allVarcharsTable';

export const allPositiveFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple@gmail.com',
  simpleVarchar: 'Oleksii`s MacBook',
  notNullVarchar: 'owner',
  varcharWithDefault: 'EN',
  notNullVarcharWithDefault: 'MacBook M1',
  uniqueVarchar: 'C02FL29VQ6LR',
  notNullUniqueVarchar: 'CNNioewqj932JOIK<O)&^%',
};

export const mixedFields: ExtractModel<AllVarcharsTable> = {
  primaryVarchar: 'exAmple2@gmail.com',
  simpleVarchar: 'Copyright © 2002–2021 Apple Inc.All rights reserved',
  notNullVarchar: 'Oleksii',
  varcharWithDefault: undefined,
  notNullVarcharWithDefault: 'undefined',
  uniqueVarchar: 'unique_varchar2',
  notNullUniqueVarchar: 'unique',

};
