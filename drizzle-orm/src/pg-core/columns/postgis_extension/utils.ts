function hexToBytes(hex: string): Uint8Array {
	const bytes: number[] = [];
	for (let c = 0; c < hex.length; c += 2) {
		bytes.push(Number.parseInt(hex.slice(c, c + 2), 16));
	}
	return new Uint8Array(bytes);
}

function bytesToFloat64(bytes: Uint8Array, offset: number): number {
	const buffer = new ArrayBuffer(8);
	const view = new DataView(buffer);
	for (let i = 0; i < 8; i++) {
		view.setUint8(i, bytes[offset + i]!);
	}
	return view.getFloat64(0, true);
}

export function parseEWKB(hex: string): [number, number] {
	const bytes = hexToBytes(hex);

	let offset = 0;

	// Byte order: 1 is little-endian, 0 is big-endian
	const byteOrder = bytes[offset];
	offset += 1;

	const view = new DataView(bytes.buffer);
	const geomType = view.getUint32(offset, byteOrder === 1);
	offset += 4;

	let _srid: number | undefined;
	if (geomType & 0x20000000) { // SRID flag
		_srid = view.getUint32(offset, byteOrder === 1);
		offset += 4;
	}

	if ((geomType & 0xFFFF) === 1) {
		const x = bytesToFloat64(bytes, offset);
		offset += 8;
		const y = bytesToFloat64(bytes, offset);
		offset += 8;

		return [x, y];
	}

	throw new Error('Unsupported geometry type');
}
