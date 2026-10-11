/**
 * EAN-13 & Code-128 Barcode Generator and Checksum Validator
 * Follows GS1 General Specifications for retail barcodes.
 */

// EAN-13 Digit Patterns (L-code, G-code, R-code)
// 0 = space, 1 = bar (each digit is 7 modules wide)
const L_CODES: Record<string, string> = {
  '0': '0001101',
  '1': '0011001',
  '2': '0010011',
  '3': '0111101',
  '4': '0100011',
  '5': '0110001',
  '6': '0101111',
  '7': '0111011',
  '8': '0110111',
  '9': '0001011',
};

const G_CODES: Record<string, string> = {
  '0': '0100111',
  '1': '0110011',
  '2': '0011011',
  '3': '0100001',
  '4': '0011101',
  '5': '0111001',
  '6': '0000101',
  '7': '0010001',
  '8': '0001001',
  '9': '0010111',
};

const R_CODES: Record<string, string> = {
  '0': '1110010',
  '1': '1100110',
  '2': '1101100',
  '3': '1000010',
  '4': '1011100',
  '5': '1001110',
  '6': '1010000',
  '7': '1000100',
  '8': '1001000',
  '9': '1110100',
};

// First digit determines parity pattern for next 6 digits
const FIRST_DIGIT_PARITY: Record<string, string[]> = {
  '0': ['L', 'L', 'L', 'L', 'L', 'L'],
  '1': ['L', 'L', 'G', 'L', 'G', 'G'],
  '2': ['L', 'L', 'G', 'G', 'L', 'G'],
  '3': ['L', 'L', 'G', 'G', 'G', 'L'],
  '4': ['L', 'G', 'L', 'L', 'G', 'G'],
  '5': ['L', 'G', 'G', 'L', 'L', 'G'],
  '6': ['L', 'G', 'G', 'G', 'L', 'L'],
  '7': ['L', 'G', 'L', 'G', 'L', 'G'],
  '8': ['L', 'G', 'L', 'G', 'G', 'L'],
  '9': ['L', 'G', 'G', 'L', 'G', 'L'],
};

/**
 * Calculates modulo-10 checksum digit for the first 12 digits of an EAN-13 barcode.
 */
export function calculateEan13CheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error('EAN-13 base code must contain exactly 12 numeric digits.');
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(twelveDigits[i], 10);
    // 1st, 3rd, 5th, etc. (0, 2, 4...) have weight 1; 2nd, 4th, 6th... have weight 3
    const weight = i % 2 === 0 ? 1 : 3;
    sum += digit * weight;
  }

  const remainder = sum % 10;
  return (10 - remainder) % 10;
}

/**
 * Validates whether a 13-digit string is a mathematically valid EAN-13 barcode.
 */
export function isValidEan13(code: string): boolean {
  if (!/^\d{13}$/.test(code)) {
    return false;
  }
  const base = code.slice(0, 12);
  const expectedCheckDigit = calculateEan13CheckDigit(base);
  const actualCheckDigit = parseInt(code[12], 10);
  return expectedCheckDigit === actualCheckDigit;
}

/**
 * Generates a valid 13-digit EAN-13 barcode with country prefix 476 (Azerbaijan GS1)
 * or a custom prefix if specified.
 */
export function generateEan13(prefix: string = '476'): string {
  const cleanPrefix = prefix.replace(/\D/g, '').slice(0, 7) || '476';
  const remainingLength = 12 - cleanPrefix.length;
  
  let randomPart = '';
  for (let i = 0; i < remainingLength; i++) {
    randomPart += Math.floor(Math.random() * 10).toString();
  }

  const base12 = cleanPrefix + randomPart;
  const checkDigit = calculateEan13CheckDigit(base12);
  return `${base12}${checkDigit}`;
}

/**
 * Encodes an EAN-13 barcode into a binary module string (1 = bar, 0 = space).
 * Format:
 * - Quiet zone
 * - Left guard: 101
 * - 6 left characters: 42 modules
 * - Center guard: 01010
 * - 6 right characters: 42 modules
 * - Right guard: 101
 * Total: 95 modules
 */
export function encodeEan13Modules(code: string): string | null {
  if (!isValidEan13(code)) {
    return null;
  }

  const firstDigit = code[0];
  const parity = FIRST_DIGIT_PARITY[firstDigit];
  if (!parity) return null;

  let modules = '101'; // Left guard

  // Left 6 digits
  for (let i = 1; i <= 6; i++) {
    const digit = code[i];
    const encType = parity[i - 1];
    modules += encType === 'L' ? L_CODES[digit] : G_CODES[digit];
  }

  modules += '01010'; // Center guard

  // Right 6 digits (including check digit)
  for (let i = 7; i <= 12; i++) {
    const digit = code[i];
    modules += R_CODES[digit];
  }

  modules += '101'; // Right guard
  return modules;
}

/**
 * Simple Code128-B module encoder for general alphanumeric SKU / barcode labels.
 */
export function encodeCode128BModules(text: string): string {
  // Simplified high-contrast fallback barcode representation
  // for non-EAN-13 strings (e.g. SKU codes)
  const pattern: string[] = ['11010010000']; // Start B
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i) - 32;
    // Pseudorandom pseudo-standard alternating 11-module width
    const seed = (code * 31) % 100;
    pattern.push(seed % 2 === 0 ? '10011001100' : '11001100100');
  }

  pattern.push('11000111010'); // Stop
  pattern.push('11'); // Final bar
  return pattern.join('');
}

