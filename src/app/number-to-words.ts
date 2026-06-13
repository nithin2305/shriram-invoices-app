// Converts a number to words in the Indian numbering system,
// formatted like the original invoice: "RUPEES EIGHT THOUSAND SIX HUNDRED TWENTY ONLY"
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function twoDigits(n: number): string {
  if (n < 20) { return ONES[n]; }
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t} ${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) { parts.push(`${ONES[h]} HUNDRED`); }
  if (rest) { parts.push(twoDigits(rest)); }
  return parts.join(' ');
}

export function numberToWordsIndian(num: number): string {
  if (!isFinite(num) || num < 0) { return ''; }
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);

  if (rupees === 0 && paise === 0) { return 'RUPEES ZERO ONLY'; }

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;

  if (crore) { parts.push(`${twoDigits(crore) || threeDigits(crore)} CRORE`); }
  if (lakh) { parts.push(`${twoDigits(lakh)} LAKH`); }
  if (thousand) { parts.push(`${twoDigits(thousand)} THOUSAND`); }
  if (n) { parts.push(threeDigits(n)); }

  let words = `RUPEES ${parts.join(' ')}`.trim();
  if (paise) {
    words += `${rupees ? ' AND ' : ' '}${twoDigits(paise)} PAISE`;
  }
  return `${words} ONLY`;
}
