/**
 * Cameroonian mobile numbers: 9 digits starting with 6, written with or without the 237 country code.
 * Returns the international form without "+" (2376XXXXXXXX), or null if it is not a mobile number.
 */
export function normalizeCameroonPhone(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('237') && digits.length === 12 ? digits.slice(3) : digits;
  return /^6\d{8}$/.test(local) ? `237${local}` : null;
}

/**
 * Best guess of the network from the prefix, for display and the USSD hint only.
 * The provider reports the real operator; numbers can be ported between networks.
 */
export function guessOperator(phone: string): 'MTN' | 'ORANGE' | null {
  const local = phone.startsWith('237') ? phone.slice(3) : phone;
  if (/^6(7|8|5[0-4])/.test(local)) return 'MTN';
  if (/^6(9|5[5-9])/.test(local)) return 'ORANGE';
  return null;
}
