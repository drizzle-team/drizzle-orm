import { readFileSync } from 'fs';
import { join } from 'path';
import { stageOut, writeSnapshot } from './check-fixtures';

// A real version:"7" postgres snapshot — upgradeable to latest by upToV8. The synthetic
// stageNonLatest stub ({version:'1', ddl:[]}) is only classifiable; upToV8 reads
// json.schemas/json.tables and crashes on it, so the up conformance fixture must be real.
const V7_FIXTURE_PATH = join(__dirname, '..', 'postgres', 'snapshots', 'snapshot05-0.23.2.json');

// Optional `out` lets the conformance harness re-stage a fresh non-latest copy at the SAME
// path before each runner call — up mutates the snapshot in place, so the prior runner would
// otherwise leave the SDK run nothing to upgrade.
export const stageUpNonLatest = (out: string = stageOut()): string => {
	const raw = JSON.parse(readFileSync(V7_FIXTURE_PATH, 'utf8'));
	writeSnapshot(out, '0000_init', raw);
	return out;
};
