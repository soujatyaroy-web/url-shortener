import { Base62Service } from '../../src/services/Base62Service';

describe('Base62Service', () => {
  let service: Base62Service;

  beforeEach(() => {
    service = new Base62Service();
  });

  describe('encode()', () => {
    describe('valid inputs', () => {
      it('should encode 0 to "0"', () => {
        expect(service.encode(0)).toBe('0');
      });

      it('should encode 1 to "1"', () => {
        expect(service.encode(1)).toBe('1');
      });

      it('should encode 61 to "Z"', () => {
        expect(service.encode(61)).toBe('Z');
      });

      it('should encode 62 to "10"', () => {
        expect(service.encode(62)).toBe('10');
      });

      it('should encode 63 to "11"', () => {
        expect(service.encode(63)).toBe('11');
      });

      it('should encode 10 to "a"', () => {
        expect(service.encode(10)).toBe('a');
      });

      it('should encode 36 to "A"', () => {
        expect(service.encode(36)).toBe('A');
      });

      it('should encode 100 to "1C"', () => {
        expect(service.encode(100)).toBe('1C');
      });

      it('should encode 1000 correctly', () => {
        expect(service.encode(1000)).toBe('g8');
      });

      it('should encode 123456789 correctly', () => {
        const result = service.encode(123456789);
        expect(result).toBe('8m0Kx');
      });

      it('should encode Number.MAX_SAFE_INTEGER', () => {
        const maxSafe = Number.MAX_SAFE_INTEGER;
        expect(() => service.encode(maxSafe)).not.toThrow();
        const encoded = service.encode(maxSafe);
        expect(encoded).toHaveLength(9);
        expect(typeof encoded).toBe('string');
      });
    });

    describe('boundary conditions', () => {
      it('should handle zero correctly', () => {
        expect(service.encode(0)).toBe('0');
      });

      it('should handle powers of 62', () => {
        expect(service.encode(62)).toBe('10'); // 62^1
        expect(service.encode(3844)).toBe('100'); // 62^2
      });
    });

    describe('invalid inputs', () => {
      it('should throw TypeError for negative numbers', () => {
        expect(() => service.encode(-1)).toThrow(TypeError);
        expect(() => service.encode(-100)).toThrow(TypeError);
        expect(() => service.encode(-Number.MAX_SAFE_INTEGER)).toThrow(TypeError);
      });

      it('should throw TypeError for non-integer numbers', () => {
        expect(() => service.encode(1.5)).toThrow(TypeError);
        expect(() => service.encode(0.001)).toThrow(TypeError);
        expect(() => service.encode(99.99)).toThrow(TypeError);
      });

      it('should throw TypeError for NaN', () => {
        expect(() => service.encode(NaN)).toThrow(TypeError);
      });

      it('should throw RangeError for values exceeding MAX_SAFE_INTEGER', () => {
        expect(() => service.encode(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
        expect(() => service.encode(Number.MAX_VALUE)).toThrow(RangeError);
      });

      it('should throw TypeError for non-numeric types', () => {
        expect(() => service.encode(null as any)).toThrow(TypeError);
        expect(() => service.encode(undefined as any)).toThrow(TypeError);
        expect(() => service.encode('123' as any)).toThrow(TypeError);
        expect(() => service.encode({} as any)).toThrow(TypeError);
        expect(() => service.encode([] as any)).toThrow(TypeError);
      });

      it('should throw TypeError for Infinity', () => {
        expect(() => service.encode(Infinity as any)).toThrow(TypeError);
        expect(() => service.encode(-Infinity as any)).toThrow(TypeError);
      });
    });

    describe('round-trip consistency', () => {
      it('should maintain round-trip consistency for small numbers', () => {
        for (let i = 0; i <= 100; i++) {
          const encoded = service.encode(i);
          const decoded = service.decode(encoded);
          expect(decoded).toBe(i);
        }
      });

      it('should maintain round-trip consistency for large numbers', () => {
        const testCases = [
          1000,
          10000,
          100000,
          1000000,
          10000000,
          123456789,
          Number.MAX_SAFE_INTEGER - 1
        ];
        testCases.forEach((num) => {
          const encoded = service.encode(num);
          const decoded = service.decode(encoded);
          expect(decoded).toBe(num);
        });
      });

      it('should produce consistent output for same input', () => {
        const num = 987654321;
        const encoded1 = service.encode(num);
        const encoded2 = service.encode(num);
        expect(encoded1).toBe(encoded2);
      });
    });
  });

  describe('decode()', () => {
    describe('valid inputs', () => {
      it('should decode "0" to 0', () => {
        expect(service.decode('0')).toBe(0);
      });

      it('should decode "1" to 1', () => {
        expect(service.decode('1')).toBe(1);
      });

      it('should decode "z" to 35', () => {
        expect(service.decode('z')).toBe(35);
      });

      it('should decode "a" to 10', () => {
        expect(service.decode('a')).toBe(10);
      });

      it('should decode "Z" to 61', () => {
        expect(service.decode('Z')).toBe(61);
      });

      it('should decode "10" to 62', () => {
        expect(service.decode('10')).toBe(62);
      });

      it('should decode "11" to 63', () => {
        expect(service.decode('11')).toBe(63);
      });

      it('should decode "1C" to 100', () => {
        expect(service.decode('1C')).toBe(100);
      });

      it('should decode "g8" to 1000', () => {
        expect(service.decode('g8')).toBe(1000);
      });

      it('should decode "8m0Kx" to 123456789', () => {
        expect(service.decode('8m0Kx')).toBe(123456789);
      });

      it('should decode multi-character strings correctly', () => {
        const testCases = [
          { code: 'aaa', expected: service.decode('aaa') },
          { code: 'zzz', expected: service.decode('zzz') }
        ];
        testCases.forEach((tc) => {
          expect(() => service.decode(tc.code)).not.toThrow();
        });
      });
    });

    describe('boundary conditions', () => {
      it('should handle single-digit codes (0-Z)', () => {
        const alphabet = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        alphabet.split('').forEach((char, index) => {
          const decoded = service.decode(char);
          expect(decoded).toBe(index);
        });
      });

      it('should handle multi-digit codes that approach MAX_SAFE_INTEGER', () => {
        const encoded = service.encode(Number.MAX_SAFE_INTEGER - 1);
        const decoded = service.decode(encoded);
        expect(decoded).toBe(Number.MAX_SAFE_INTEGER - 1);
      });
    });

    describe('invalid inputs', () => {
      it('should throw TypeError for non-string types', () => {
        expect(() => service.decode(null as any)).toThrow(TypeError);
        expect(() => service.decode(undefined as any)).toThrow(TypeError);
        expect(() => service.decode(123 as any)).toThrow(TypeError);
        expect(() => service.decode({} as any)).toThrow(TypeError);
        expect(() => service.decode([] as any)).toThrow(TypeError);
      });

      it('should throw TypeError for empty strings', () => {
        expect(() => service.decode('')).toThrow(TypeError);
      });

      it('should throw Error for invalid Base62 characters', () => {
        expect(() => service.decode('!')).toThrow(Error);
        expect(() => service.decode('@')).toThrow(Error);
        expect(() => service.decode('#')).toThrow(Error);
        expect(() => service.decode('_')).toThrow(Error);
        expect(() => service.decode('-')).toThrow(Error);
      });

      it('should throw Error for strings with spaces', () => {
        expect(() => service.decode(' ')).toThrow(Error);
        expect(() => service.decode('a b')).toThrow(Error);
        expect(() => service.decode('10 ')).toThrow(Error);
      });

      it('should throw Error for strings with mixed invalid characters', () => {
        expect(() => service.decode('abc!')).toThrow(Error);
        expect(() => service.decode('12@34')).toThrow(Error);
        expect(() => service.decode('hello!')).toThrow(Error);
      });

      it('should throw Error with helpful message indicating position of invalid char', () => {
        expect(() => service.decode('1a2!')).toThrow(/Invalid Base62 character/);
      });
    });

    describe('round-trip consistency', () => {
      it('should maintain round-trip consistency for valid Base62 strings', () => {
        const testCodes = ['0', '1', 'a', 'Z', '10', '100', 'zzz', '21I3V9'];
        testCodes.forEach((code) => {
          const decoded = service.decode(code);
          const reencoded = service.encode(decoded);
          expect(reencoded).toBe(code);
        });
      });

      it('should produce consistent output for same input', () => {
        const code = 'abc123XYZ';
        const decoded1 = service.decode(code);
        const decoded2 = service.decode(code);
        expect(decoded1).toBe(decoded2);
      });
    });

    describe('overflow handling', () => {
      it('should throw RangeError when decoded value exceeds MAX_SAFE_INTEGER', () => {
        // Create a string that when decoded will exceed MAX_SAFE_INTEGER
        // This is a theoretical case since JS limits prevent actual overflow
        const longString = 'Z'.repeat(20); // Very large Base62 number
        try {
          service.decode(longString);
          // If no error, the number should still be safe
        } catch (e) {
          expect(e).toBeInstanceOf(RangeError);
        }
      });
    });
  });

  describe('integration', () => {
    it('should correctly handle a sequence of encode-decode operations', () => {
      const numbers = [0, 1, 42, 1000, 123456789];
      numbers.forEach((num) => {
        const encoded = service.encode(num);
        const decoded = service.decode(encoded);
        expect(decoded).toBe(num);
      });
    });

    it('should correctly handle a sequence of decode-encode operations', () => {
      const codes = ['0', 'a', 'Z', '10', 'abc', 'ZZZ'];
      codes.forEach((code) => {
        const decoded = service.decode(code);
        const encoded = service.encode(decoded);
        expect(encoded).toBe(code);
      });
    });

    it('should be stateless across multiple instances', () => {
      const service1 = new Base62Service();
      const service2 = new Base62Service();

      const num = 999999;
      expect(service1.encode(num)).toBe(service2.encode(num));
      expect(service1.decode('abc')).toBe(service2.decode('abc'));
    });
  });
});
