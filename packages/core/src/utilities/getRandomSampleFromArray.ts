/**
 * Gets a random sample of specified size from the array.
 * If the requested size is greater than the array length, returns a shuffled clone of the original array.
 * @param array - The source array from which to sample.
 * @param size - The number of elements to sample from the array.
 * @returns A new array containing the random sample.
 */
export function getRandomSampleFromArray<T>(array: T[], size: number): T[] {
  const clonedArray = [...array]; // Copy the original array

  // If requested size is greater than array length, shuffle and return clone of the original array
  if (size >= clonedArray.length) {
    shuffleArray(clonedArray);
    return clonedArray;
  }

  shuffleArray(clonedArray);
  return clonedArray.slice(0, size);
}

/**
 * Shuffles an array
 * @param array - The array to shuffle.
 */
function shuffleArray<T>(array: T[]): void {
  const randomValues = new Uint32Array(array.length);
  crypto.getRandomValues(randomValues);
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomValues[i] % (i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
}
