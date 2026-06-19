/**
 * Returns a random RGB triplet
 * @returns rgb
 */
export function getRandomRGBColor(): number[] {
  const rgb = new Uint8Array(3);
  crypto.getRandomValues(rgb);
  return Array.from(rgb);
}
