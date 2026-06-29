import { utilities } from '@cornerstonejs/core';

const { toFiniteNumber } = utilities;

type StatValue = number | number[] | null | undefined;

/**
 * Returns a numeric result only when it is finite and valid for export.
 *
 * - number   -> returns the number if finite
 * - number[] -> returns the array if every value is finite
 * - null/undefined/NaN/Infinity -> returns undefined
 */
export function getValidatedNumericValue(
  value: StatValue
): number | number[] | undefined {
  if (value == null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const allValid = value.every(
      (v) => typeof v === 'number' && toFiniteNumber(v) !== undefined
    );

    return allValid && value.length > 0 ? value : undefined;
  }

  return typeof value === 'number' ? toFiniteNumber(value) : undefined;
}
