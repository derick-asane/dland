/** Local part (9 digits starting with 6) of a Cameroonian mobile number, or null. Same rule as the API. */
export function cameroonLocalNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  const local = digits.startsWith('237') && digits.length === 12 ? digits.slice(3) : digits;
  return /^6\d{8}$/.test(local) ? local : null;
}

/** Network guessed from the prefix, only to show the right instructions. */
export function guessOperator(local: string): 'MTN' | 'ORANGE' | null {
  if (/^6(7|8|5[0-4])/.test(local)) return 'MTN';
  if (/^6(9|5[5-9])/.test(local)) return 'ORANGE';
  return null;
}

/** 2376XXXXXXXX → +237 6XX XX XX XX */
export const formatCameroonPhone = (phone: string) => {
  const local = cameroonLocalNumber(phone);
  return local ? `+237 ${local.slice(0, 3)} ${local.slice(3, 5)} ${local.slice(5, 7)} ${local.slice(7)}` : phone;
};
