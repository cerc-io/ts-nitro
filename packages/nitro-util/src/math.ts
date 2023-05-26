// Random integer in range [0 - 2^64)
export function randUint64(): number {
  return Math.floor(Math.random() * (2 ** 64));
}
