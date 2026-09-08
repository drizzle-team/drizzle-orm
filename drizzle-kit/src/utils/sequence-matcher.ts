/**
 * A sequence matcher for string arrays that finds differences
 * and tracks positions of added elements.
 */
export function diffStringArrays(oldArr: string[], newArr: string[]): {
	type: 'same' | 'removed' | 'added';
	value: string;
	beforeValue?: string;
}[] {
	// Get edit operations
	const opcodes = getOpcodes(oldArr, newArr);

	// Convert to the requested format
	return formatResult(opcodes, oldArr, newArr);
}

/**
 * Get edit operations between two arrays
 */
function getOpcodes(
	oldArray: string[],
	newArray: string[],
): Array<['equal' | 'delete' | 'insert' | 'replace', number, number, number, number]> {
	// Get matching blocks
	const matchingBlocks = getMatchingBlocks(oldArray, newArray);

	// Convert to opcodes
	const opcodes: Array<['equal' | 'delete' | 'insert' | 'replace', number, number, number, number]> = [];
	let oldIndex = 0;
	let newIndex = 0;

	for (const [oldBlockStart, newBlockStart, matchLength] of matchingBlocks) {
		// Handle differences before this match
		if (oldIndex < oldBlockStart || newIndex < newBlockStart) {
			const tag: 'delete' | 'insert' | 'replace' = oldIndex < oldBlockStart && newIndex < newBlockStart
				? 'replace'
				: oldIndex < oldBlockStart
				? 'delete'
				: 'insert';
			opcodes.push([tag, oldIndex, oldBlockStart, newIndex, newBlockStart]);
		}

		// Handle the match itself
		if (matchLength > 0) {
			opcodes.push(['equal', oldBlockStart, oldBlockStart + matchLength, newBlockStart, newBlockStart + matchLength]);
		}

		// Update positions
		oldIndex = oldBlockStart + matchLength;
		newIndex = newBlockStart + matchLength;
	}

	return opcodes;
}

/**
 * Get matching blocks between two arrays
 */
function getMatchingBlocks(oldArray: string[], newArray: string[]): Array<[number, number, number]> {
	// Special case for empty arrays
	if (oldArray.length === 0 && newArray.length === 0) {
		return [[0, 0, 0]];
	}

	// Find matching blocks recursively
	const matchQueue: Array<[number, number, number, number]> = [[0, oldArray.length, 0, newArray.length]];
	const matches: Array<[number, number, number]> = [];

	while (matchQueue.length > 0) {
		const [oldStart, oldEnd, newStart, newEnd] = matchQueue.pop()!;

		// Find longest match in this range
		const [oldMatchStart, newMatchStart, matchLength] = findLongestMatch(
			oldArray,
			newArray,
			oldStart,
			oldEnd,
			newStart,
			newEnd,
		);

		if (matchLength > 0) {
			matches.push([oldMatchStart, newMatchStart, matchLength]);

			// Add regions before the match to the queue
			if (oldStart < oldMatchStart && newStart < newMatchStart) {
				matchQueue.push([oldStart, oldMatchStart, newStart, newMatchStart]);
			}

			// Add regions after the match to the queue
			if (oldMatchStart + matchLength < oldEnd && newMatchStart + matchLength < newEnd) {
				matchQueue.push([oldMatchStart + matchLength, oldEnd, newMatchStart + matchLength, newEnd]);
			}
		}
	}

	// Sort matches and add sentinel
	matches.sort((a, b) => a[0] - b[0]);
	matches.push([oldArray.length, newArray.length, 0]);

	return matches;
}

/**
 * Find the longest matching block in oldArray[oldStart:oldEnd] and newArray[newStart:newEnd]
 */
function findLongestMatch(
	oldArray: string[],
	newArray: string[],
	oldStart: number,
	oldEnd: number,
	newStart: number,
	newEnd: number,
): [number, number, number] {
	let bestOldStart = oldStart;
	let bestNewStart = newStart;
	let bestMatchLength = 0;

	// Create a map of elements in newArray to their positions
	const newElementPositions: Map<string, number[]> = new Map();
	for (let newIndex = newStart; newIndex < newEnd; newIndex++) {
		const element = newArray[newIndex];
		if (!newElementPositions.has(element)) {
			newElementPositions.set(element, []);
		}
		newElementPositions.get(element)!.push(newIndex);
	}

	// For each element in oldArray, check for matches in newArray
	for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex++) {
		const element = oldArray[oldIndex];
		if (!newElementPositions.has(element)) continue;

		for (const newIndex of newElementPositions.get(element)!) {
			// Skip if we're past the end
			if (newIndex >= newEnd) continue;

			// Count how many consecutive elements match
			let currentMatchLength = 1;
			while (
				oldIndex + currentMatchLength < oldEnd
				&& newIndex + currentMatchLength < newEnd
				&& oldArray[oldIndex + currentMatchLength] === newArray[newIndex + currentMatchLength]
			) {
				currentMatchLength++;
			}

			if (currentMatchLength > bestMatchLength) {
				bestOldStart = oldIndex;
				bestNewStart = newIndex;
				bestMatchLength = currentMatchLength;
			}
		}
	}

	return [bestOldStart, bestNewStart, bestMatchLength];
}

/**
 * Format the opcodes into the requested result format
 */
function formatResult(
	opcodes: Array<['equal' | 'delete' | 'insert' | 'replace', number, number, number, number]>,
	oldArray: string[],
	newArray: string[],
): {
	type: 'same' | 'removed' | 'added';
	value: string;
	beforeValue?: string;
	isAtEnd?: boolean;
}[] {
	const result: {
		type: 'same' | 'removed' | 'added';
		value: string;
		beforeValue?: string;
		isAtEnd?: boolean;
	}[] = [];

	for (const [tag, oldStart, oldEnd, newStart, newEnd] of opcodes) {
		if (tag === 'equal') {
			// Same elements in both arrays
			for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex++) {
				result.push({
					type: 'same',
					value: oldArray[oldIndex],
				});
			}
			continue;
		}

		if (tag === 'delete') {
			// Elements removed from oldArray
			for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex++) {
				result.push({
					type: 'removed',
					value: oldArray[oldIndex],
				});
			}
			continue;
		}

		if (tag === 'insert') {
			// Elements added in newArray
			for (let newIndex = newStart; newIndex < newEnd; newIndex++) {
				addWithPosition(newArray[newIndex], newIndex, newArray, oldArray, result);
			}
			continue;
		}

		if (tag === 'replace') {
			// Both removal and addition
			// First, handle removals
			for (let oldIndex = oldStart; oldIndex < oldEnd; oldIndex++) {
				result.push({
					type: 'removed',
					value: oldArray[oldIndex],
				});
			}

			// Then, handle additions
			for (let newIndex = newStart; newIndex < newEnd; newIndex++) {
				addWithPosition(newArray[newIndex], newIndex, newArray, oldArray, result);
			}
			continue;
		}
	}

	return result;
}

/**
 * Helper function to add an element with position information
 */
function addWithPosition(
	value: string,
	currentIndex: number,
	newArray: string[],
	oldElementSet: string[],
	result: {
		type: 'same' | 'removed' | 'added';
		value: string;
		beforeValue?: string;
	}[],
): void {
	// Find what this added element comes before
	let beforeValue: string | undefined = undefined;

	// Look ahead to find the next element that exists in oldArray
	for (let lookAheadIndex = currentIndex + 1; lookAheadIndex < newArray.length; lookAheadIndex++) {
		if (oldElementSet.indexOf(newArray[lookAheadIndex]) >= 0) {
			beforeValue = newArray[lookAheadIndex];
			break;
		}
	}

	result.push({
		type: 'added',
		value,
		beforeValue,
	});
}
