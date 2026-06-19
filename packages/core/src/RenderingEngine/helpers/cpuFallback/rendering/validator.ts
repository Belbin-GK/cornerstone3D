import { isInvalidNumber } from '../../isInvalidNumber';

const DEFAULT_PIXEL_SPACING = 1;

/**
 * Sanitizes pixel spacing from DICOM metadata for use in rendering logic.
 * Returns a positive finite number, defaulting to 1 when invalid.
 */
export function sanitizePixelSpacing(value: number): number {
  if (isInvalidNumber(value) || value <= 0) {
    return DEFAULT_PIXEL_SPACING;
  }

  return value;
}

/**
 * Check if the supplied parameter is undefined and throws an error
 * @param {unknown} checkParam the parameter to validate for undefined
 * @param {string} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefined(
  checkParam: unknown,
  errorMsg: string
): void {
  if (checkParam === undefined) {
    throw new Error(errorMsg);
  }
}

/**
 * Check if the supplied parameter is undefined or null and throws an error
 * @param {unknown} checkParam the parameter to validate for undefined or null
 * @param {string} errorMsg the error message to be thrown
 * @returns {void}
 * @memberof internal
 */
export function validateParameterUndefinedOrNull(
  checkParam: unknown,
  errorMsg: string
): void {
  if (checkParam === undefined || checkParam === null) {
    throw new Error(errorMsg);
  }
}
