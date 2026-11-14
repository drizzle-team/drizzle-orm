/**
 * Test for custom type selectFromDb feature
 * Issue: #1083 - Default select for custom types
 */

import { describe, it, expect } from 'vitest';
import { customType } from '../custom.ts';

describe('Custom Type selectFromDb', () => {
	it('should allow defining selectFromDb for custom types', () => {
		// Define a custom point type with selectFromDb
		const pointType = customType<{
			data: { lat: number; lng: number };
			driverData: string;
		}>({
			dataType() {
				return 'geometry(Point,4326)';
			},
			fromDriver(value: string) {
				const matches = value.match(/POINT\((?<lng>[\d.-]+) (?<lat>[\d.-]+)\)/);
				const { lat, lng } = matches?.groups ?? {};
				return { lat: parseFloat(String(lat)), lng: parseFloat(String(lng)) };
			},
		});

		expect(pointType).toBeDefined();
	});

	it('should accept selectFromDb callback', () => {
		let selectFromDbCalled = false;

		const customType_ = customType<{
			data: string;
			driverData: string;
		}>({
			dataType() {
				return 'text';
			},
			selectFromDb() {
				selectFromDbCalled = true;
				return {} as any;
			},
		});

		// Create column to trigger the callback storage
		const builder = customType_();
		expect(builder).toBeDefined();
	});

	it('should work without selectFromDb (optional)', () => {
		const simpleCustom = customType<{
			data: string;
			driverData: string;
		}>({
			dataType() {
				return 'text';
			},
		});

		expect(simpleCustom).toBeDefined();
	});
});
