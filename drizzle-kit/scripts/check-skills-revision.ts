import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseSkillsRevision, readSkillsRevisionFromDisk } from './lib/read-skills-revision';

const REPO_ROOT = resolve(__dirname, '..', '..');
const SKILLS_DIR = resolve(__dirname, '..', 'skills');
const UMBRELLA_RELPATH = 'drizzle-kit/skills/drizzle/SKILL.md';

const sh = (cmd: string, args: string[]) => spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });

// Detect the branch this feature was forked off by finding the most-recent merge-base between
// HEAD and any other `origin/` ref. Closest merge-base wins — that's the branch HEAD most-recently
// diverged from. Returns the merge-base SHA, or null if no fork point can be determined (lone
// branch, fresh repo, etc.). Requires `actions/checkout` with `fetch-depth: 0` so all remote
// refs are reachable.
const detectForkPoint = (): string | null => {
	const upstreamRef = (() => {
		const r = sh('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
		return r.status === 0 ? r.stdout.trim() : '';
	})();
	const refList = sh('git', ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/']);
	if (refList.status !== 0) return null;
	const refs = refList.stdout
		.split('\n')
		.map((r) => r.trim())
		.filter((r) => r && r !== 'origin/HEAD' && r !== upstreamRef);
	if (refs.length === 0) return null;
	const headSha = sh('git', ['rev-parse', 'HEAD']);
	if (headSha.status !== 0) return null;
	const head = headSha.stdout.trim();
	let best: { baseSha: string; distance: number } | null = null;
	for (const ref of refs) {
		const mb = sh('git', ['merge-base', 'HEAD', ref]);
		if (mb.status !== 0) continue;
		const baseSha = mb.stdout.trim();
		if (baseSha === head) continue; // HEAD is an ancestor of ref; not a fork point.
		const dist = sh('git', ['rev-list', '--count', `${baseSha}..HEAD`]);
		if (dist.status !== 0) continue;
		const distance = Number.parseInt(dist.stdout.trim(), 10);
		if (!Number.isFinite(distance) || distance <= 0) continue;
		if (!best || distance < best.distance) best = { baseSha, distance };
	}
	return best ? best.baseSha : null;
};

const computeBaseline = (): string => {
	// PR context: the PR's base branch SHA (set from `github.event.pull_request.base.sha`).
	const baseSha = process.env['GH_BASE_SHA']?.trim();
	if (baseSha) return baseSha;
	// Push / local context: auto-detect the fork point so the gate diffs the whole branch
	// against the branch it was forked off (which can be any branch). Catches skills changes
	// spread across multiple commits, not just the latest one.
	const detected = detectForkPoint();
	if (detected) return detected;
	// Last-resort fallback (no remote refs / detached HEAD / repo with no other branches):
	// the previous commit on this branch.
	const r = sh('git', ['rev-parse', 'HEAD~1']);
	if (r.status !== 0) throw new Error(`git rev-parse HEAD~1 failed: ${r.stderr}`);
	return r.stdout.trim();
};

const skillsTouched = (baseline: string): string[] => {
	const r = sh('git', ['diff', '--name-only', `${baseline}..HEAD`, '--', 'drizzle-kit/skills/']);
	if (r.status !== 0) throw new Error(`git diff failed: ${r.stderr}`);
	return r.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
};

const revisionAtBaseline = (baseline: string): { kind: 'new' } | { kind: 'value'; value: number } => {
	const r = sh('git', ['show', `${baseline}:${UMBRELLA_RELPATH}`]);
	// `git show <sha>:<path>` reports a missing path with two distinct messages depending on
	// whether the worktree has the file: "does not exist in '<sha>'" when absent from the worktree,
	// "exists on disk, but not in '<sha>'" when present in the worktree but not in the commit.
	// Both mean the file didn't exist at the baseline — treat as first introduction.
	if (r.status === 128 && /does not exist in|exists on disk, but not in/.test(r.stderr)) return { kind: 'new' };
	if (r.status !== 0) throw new Error(`git show ${baseline}:${UMBRELLA_RELPATH} failed: ${r.stderr}`);
	// Pre-rename baselines carried `metadata.skillsRevision` as a semver string. The new parser will
	// throw on those; treat the parse failure as revision 0 so the first post-rename bump still
	// passes the strict-increase check. Remove this fallback once `main` no longer carries the
	// legacy field at any reachable baseline.
	try {
		return { kind: 'value', value: Number.parseInt(parseSkillsRevision(r.stdout), 10) };
	} catch {
		return { kind: 'value', value: 0 };
	}
};

const main = (): number => {
	const baseline = computeBaseline();
	const touched = skillsTouched(baseline);
	if (touched.length === 0) {
		console.log(`No files under drizzle-kit/skills/ changed since ${baseline}; nothing to check.`);
		return 0;
	}
	const at = revisionAtBaseline(baseline);
	if (at.kind === 'value' && !existsSync(resolve(SKILLS_DIR, 'drizzle', 'SKILL.md'))) {
		console.error(
			`Umbrella SKILL.md is missing at HEAD but present at baseline (${baseline.slice(0, 8)}).\n`
				+ `  Path: ${UMBRELLA_RELPATH}\n`
				+ `Restore the file (or revert its deletion); the umbrella owns the canonical metadata.revision the publish gate reads.`,
		);
		return 1;
	}
	const head = Number.parseInt(readSkillsRevisionFromDisk(SKILLS_DIR), 10);
	if (at.kind === 'new') {
		console.log(`Umbrella SKILL.md was introduced in this range; treating revision ${head} as the initial bump.`);
		return 0;
	}
	if (head <= at.value) {
		const reason = head === at.value
			? `was not bumped`
			: `moved ${at.value} -> ${head} (not a strict increase)`;
		console.error(
			`Skills bundle drift detected; metadata.revision ${reason}.\n`
				+ `  baseline (${baseline.slice(0, 8)}): ${at.value}\n`
				+ `  HEAD: ${head}\n`
				+ `  Files changed under drizzle-kit/skills/:\n`
				+ touched.map((f) => `    ${f}`).join('\n')
				+ `\nIncrement metadata.revision in ${UMBRELLA_RELPATH} and commit it in the same range.`,
		);
		return 1;
	}
	console.log(`metadata.revision bumped ${at.value} -> ${head}; ${touched.length} skills files changed.`);
	return 0;
};

process.exit(main());
