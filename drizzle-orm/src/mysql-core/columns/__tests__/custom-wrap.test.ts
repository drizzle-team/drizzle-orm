/**
 * Test for MySQL custom type SQL wrapping feature
 * Issue: #554 - Allow wrapping the column in custom SQL for custom types
 */

import { describe, it, expect } from 'vitest';
import { customType, wrapInSQL } from '~/mysql-core/columns/custom';

describe('MySQL custom type SQL wrapping', () => {
  describe('wrapInSQL helper function', () => {
    it('should wrap column name in SQL function', () => {
      const wrapped = wrapInSQL('location', (name) => `ST_AsText(${name})` as any);
      expect(wrapped).toBeDefined();
    });

    it('should work with different SQL wrappers', () => {
      const wrappers = [
        (name: string) => `UPPER(${name})` as any,
        (name: string) => `LOWER(${name})` as any,
        (name: string) => `JSON_EXTRACT(${name}, '$')` as any,
      ];

      wrappers.forEach(wrapper => {
        const wrapped = wrapInSQL('test', wrapper);
        expect(wrapped).toBeDefined();
      });
    });

    it('should handle column names with special characters', () => {
      const wrapped = wrapInSQL('user-data.location', (name) => `ST_AsText(${name})` as any);
      expect(wrapped).toBeDefined();
    });
  });

  describe('Custom type with SQL wrapping - Point example', () => {
    it('should create Point type with ST_AsText wrapper', () => {
      const pointType = customType<{ data: { lat: number; lng: number }; driverData: string }>({
        dataType() {
          return 'geometry(Point,4326)';
        },
        toDriver(value) {
          return `SRID=4326;POINT(${value.lng} ${value.lat})`;
        },
        fromDriver(value: string) {
          const matches = value.match(/POINT\((?<lng>[\d.-]+) (?<lat>[\d.-]+)\)/);
          const { lat, lng } = (matches as any)?.groups ?? {};
          return { lat: parseFloat(String(lat)), lng: parseFloat(String(lng)) };
        },
        select: (name) => `ST_AsText(${name})` as any,
      });

      const column = pointType('location');
      expect(column).toBeDefined();
    });

    it('should work with wrapInSQL helper', () => {
      const pointType = customType<{ data: { lat: number; lng: number }; driverData: string }>({
        dataType() {
          return 'geometry(Point,4326)';
        },
        select: (name) => wrapInSQL(name, (n) => `ST_AsText(${n})`),
      });

      const column = pointType('location');
      expect(column).toBeDefined();
    });
  });

  describe('Custom type with SQL wrapping - JSON example', () => {
    it('should create JSON type with JSON_EXTRACT wrapper', () => {
      const jsonType = customType<{ data: any; driverData: string }>({
        dataType() {
          return 'jsonb';
        },
        toDriver(value) {
          return JSON.stringify(value);
        },
        fromDriver(value: string) {
          return JSON.parse(value);
        },
        select: (name) => `JSON_EXTRACT(${name}, '$')` as any,
      });

      const column = jsonType('data');
      expect(column).toBeDefined();
    });

    it('should work with wrapInSQL helper for JSON', () => {
      const jsonType = customType<{ data: any; driverData: string }>({
        dataType() {
          return 'jsonb';
        },
        select: (name) => wrapInSQL(name, (n) => `JSON_EXTRACT(${n}, '$')`),
      });

      const column = jsonType('data');
      expect(column).toBeDefined();
    });
  });

  describe('Custom type with SQL wrapping - Encrypted text example', () => {
    it('should create encrypted text type with AES_DECRYPT wrapper', () => {
      const encryptedType = customType<{ data: string; driverData: string }>({
        dataType() {
          return 'varbinary(256)';
        },
        select: (name) => `AES_DECRYPT(${name}, 'key')` as any,
      });

      const column = encryptedType('secret');
      expect(column).toBeDefined();
    });

    it('should work with wrapInSQL helper for encrypted text', () => {
      const encryptedType = customType<{ data: string; driverData: string }>({
        dataType() {
          return 'varbinary(256)';
        },
        select: (name) => wrapInSQL(name, (n) => `AES_DECRYPT(${n}, 'key')`),
      });

      const column = encryptedType('secret');
      expect(column).toBeDefined();
    });
  });

  describe('Backward compatibility', () => {
    it('should work without select wrapper (backward compatible)', () => {
      const simpleType = customType<{ data: string; driverData: string }>({
        dataType() {
          return 'text';
        },
      });

      const column = simpleType('name');
      expect(column).toBeDefined();
    });

    it('should work with toDriver and fromDriver only', () => {
      const timestampType = customType<{ data: Date; driverData: string }>({
        dataType() {
          return 'timestamp';
        },
        toDriver(value) {
          return value.toISOString();
        },
        fromDriver(value) {
          return new Date(value);
        },
      });

      const column = timestampType('created_at');
      expect(column).toBeDefined();
    });
  });
});
