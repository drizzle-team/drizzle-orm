// Cursor tokens pair an events-table epoch (rotated on every DDL recreate) with a snapshot
// so a stale token — one minted before the table was dropped/recreated — is detectable: the
// epoch won't match the current one.

export function formatCursor(epoch: string, snapshot: number): string {
  return `${epoch}:${snapshot}`;
}

export function parseCursor(token: string): { epoch: string; snapshot: number } | null {
  const separator = token.indexOf(':');
  if (separator <= 0) return null;

  const epoch = token.slice(0, separator);
  const snapshotText = token.slice(separator + 1);
  if (!/^\d+$/.test(snapshotText)) return null;

  const snapshot = Number(snapshotText);
  if (!Number.isSafeInteger(snapshot)) return null;

  return { epoch, snapshot };
}
