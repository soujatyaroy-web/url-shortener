/**
 * Standalone utility for encoding and decoding Base62 strings.
 * Optimized for high-throughput execution under strict memory allocations.
 */
export class Base62Service {
  // Standard Base62 alphabet (0-9, a-z, A-Z)
  private readonly ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private readonly BASE = 62;
  
  // Pre-computed map for O(1) character decoding lookups
  private readonly charMap: Map<string, number>;

  constructor() {
    this.charMap = new Map<string, number>();
    for (let i = 0; i < this.BASE; i++) {
      this.charMap.set(this.ALPHABET[i], i);
    }
  }

  /**
   * Encodes a base-10 integer into a Base62 string.
   * @param id - The base-10 integer to encode. Must be >= 0 and a safe integer.
   */
  public encode(id: number): string {
    if (!Number.isInteger(id) || id < 0) {
      throw new TypeError('Encoding requires a non-negative integer.');
    }

    if (!Number.isSafeInteger(id)) {
      throw new RangeError('Input ID exceeds JavaScript MAX_SAFE_INTEGER limits.');
    }

    // Explicit edge case handling for 0
    if (id === 0) {
      return this.ALPHABET[0];
    }

    const resultChars: string[] = [];
    let currentId = id;

    // Use an array to store fragments, eliminating string allocation thrashing
    while (currentId > 0) {
      const remainder = currentId % this.BASE;
      resultChars.push(this.ALPHABET[remainder]);
      currentId = Math.floor(currentId / this.BASE);
    }

    // Reverse and join array for highly optimal, single-allocation memory generation
    return resultChars.reverse().join('');
  }

  /**
   * Decodes a Base62 string back into a base-10 integer.
   * @param code - The Base62 string to decode.
   */
  public decode(code: string): number {
    if (typeof code !== 'string' || code.length === 0) {
      throw new TypeError('Decoding requires a non-empty string.');
    }

    let decoded = 0;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const charValue = this.charMap.get(char);

      if (charValue === undefined) {
        throw new Error(`Invalid Base62 character encountered: '${char}' at index ${i}.`);
      }

      decoded = (decoded * this.BASE) + charValue;
    }

    if (!Number.isSafeInteger(decoded)) {
      throw new RangeError('Decoded value exceeds JavaScript MAX_SAFE_INTEGER limits.');
    }

    return decoded;
  }
}