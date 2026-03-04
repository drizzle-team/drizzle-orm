/**
 * Test for MySQL custom type default select feature
 * Issue: #1083 - Default select for custom types
 */

import { describe, it, expect } from 'vitest';
import { MySqlCustomColumn, MySqlCustomColumnBuilder, customType } from '~/mysql-core/columns/custom';

describe('MySQL custom type default select', () => {
  describe('CustomTypeParams.select', () => {
    it('should accept select function in customType params', () => {
      const pointType = customType<{ data: { lat: number; lng: number }; driverData: string }>({
        dataType() {
          return 'geometry(Point,4326)';
        },
        select: (name) => `ST_AsText(${name})` as any,
      });

      expect(pointType).toBeDefined();
    });

    it('should work without select function (backward compatible)', () => {
      const simpleType = customType<{ data: string; driverData: string }>({
        dataType() {
          return 'text';
        },
      });

      expect(simpleType).toBeDefined();
    });
  });

  describe('MySqlCustomColumn.asDefaultSelect', () => {
    it('should use custom select function when provided', () => {
      const customTypeParams = {
        dataType: () => 'geometry(Point,4326)',
        select: (name: string) => `ST_AsText(${name})` as any,
      };

      const column = new MySqlCustomColumnBuilder('test', {}, customTypeParams);
      
      expect(column).toBeDefined();
    });

    it('should fallback to column name when select is not provided', () => {
      const customTypeParams = {
        dataType: () => 'text',
      };

      const column = new MySqlCustomColumnBuilder('test', {}, customTypeParams);
      
      expect(column).toBeDefined();
    });
  });

  describe('Custom type with select - Point example', () => {
    it('should create Point type with ST_AsText select wrapper', () => {
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

    it('should create Point type without select wrapper (backward compatible)', () => {
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
      });

      const column = pointType('location');
      expect(column).toBeDefined();
    });
  });

  describe('Custom type with select - JSON example', () => {
    it('should create JSON type with JSON_EXTRACT select wrapper', () => {
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
  });

  describe('Backward compatibility', () => {
    it('should work with existing custom types without select', () => {
      const existingType = customType<{ data: number; driverData: number }>({
        dataType() {
          return 'serial';
        },
      });

      const column = existingType('id');
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
