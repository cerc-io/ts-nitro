// Random integer in range [0 - 2^64)
// function combines two 32-bit random numbers to form a 64-bit random number
export function randUint64(): string {
  const randomNumber = BigInt(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)) * BigInt(2) ** BigInt(32)
    + BigInt(Math.floor(Math.random() * (2 ** 32)));
  const result = randomNumber.toString();

  return result;
}
