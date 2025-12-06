function isHexString(str: string): boolean {
  if (!str || str.length === 0) {
    return false;
  }
  return /^(0x)?[0-9a-fA-F]+(h)?$/i.test(str);
}

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
  if (isHexString(hex)) {
    const bytes = hexToBytes(hex);

    let offset = 0;

    // Byte order: 1 is little-endian, 0 is big-endian
    const byteOrder = bytes[offset];
    offset += 1;

    const view = new DataView(bytes.buffer);
    const geomType = view.getUint32(offset, byteOrder === 1);
    offset += 4;

    let _srid: number | undefined;
    if (geomType & 0x20000000) {
      // SRID flag
      _srid = view.getUint32(offset, byteOrder === 1);
      offset += 4;
    }

    if ((geomType & 0xffff) === 1) {
      const x = bytesToFloat64(bytes, offset);
      offset += 8;
      const y = bytesToFloat64(bytes, offset);
      offset += 8;

      return [x, y];
    }

    throw new Error("Unsupported geometry type");
  }

  // What was causing https://github.com/drizzle-team/drizzle-orm/issues/2788 was that when using the query builder,
  // the expected hex string was actually a GeoJSON string.
  // So as a fallback, we can try to parse it as JSON.
  // This is not the most efficient way, but it ensures compatibility with the query builder.
  if (typeof hex === "string") {
    const result = JSON.parse(hex);

    if (result.coordinates) {
      return result.coordinates;
    }
  }

  if (typeof hex === "object") {
    if ((hex as any).coordinates) {
      return (hex as any).coordinates;
    }
  }

  throw new Error("Invalid GeoJSON format");
}
