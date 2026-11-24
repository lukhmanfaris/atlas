const SMALL = [
  "ZERO",
  "ONE",
  "TWO",
  "THREE",
  "FOUR",
  "FIVE",
  "SIX",
  "SEVEN",
  "EIGHT",
  "NINE",
  "TEN",
  "ELEVEN",
  "TWELVE",
  "THIRTEEN",
  "FOURTEEN",
  "FIFTEEN",
  "SIXTEEN",
  "SEVENTEEN",
  "EIGHTEEN",
  "NINETEEN",
];

const TENS = [
  "",
  "",
  "TWENTY",
  "THIRTY",
  "FORTY",
  "FIFTY",
  "SIXTY",
  "SEVENTY",
  "EIGHTY",
  "NINETY",
];

function underThousand(value: number): string {
  const parts: string[] = [];
  let remainder = value;

  if (remainder >= 100) {
    parts.push(`${SMALL[Math.floor(remainder / 100)]} HUNDRED`);
    remainder %= 100;
  }

  if (remainder >= 20) {
    const tens = TENS[Math.floor(remainder / 10)] ?? "";
    const units = remainder % 10;
    parts.push(units ? `${tens} ${SMALL[units] ?? ""}` : tens);
  } else if (remainder > 0) {
    parts.push(SMALL[remainder] ?? "");
  }

  return parts.join(" ");
}

function integerWords(value: number): string {
  if (value === 0) {
    return "ZERO";
  }

  const groups: { size: number; label: string }[] = [
    { size: 1_000_000_000, label: "BILLION" },
    { size: 1_000_000, label: "MILLION" },
    { size: 1_000, label: "THOUSAND" },
  ];

  const parts: string[] = [];
  let remainder = value;

  for (const group of groups) {
    if (remainder >= group.size) {
      const count = Math.floor(remainder / group.size);
      parts.push(`${integerWords(count)} ${group.label}`);
      remainder %= group.size;
    }
  }

  if (remainder > 0) {
    parts.push(underThousand(remainder));
  }

  return parts.join(" ");
}

/**
 * 1250.50 -> "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED FIFTY AND SEN FIFTY ONLY"
 * 1250.00 -> "RINGGIT MALAYSIA ONE THOUSAND TWO HUNDRED FIFTY ONLY"
 */
export function amountInWords(sen: number): string {
  const safe = Math.max(0, Math.trunc(sen));
  const ringgit = Math.floor(safe / 100);
  const cents = safe % 100;

  const words = `RINGGIT MALAYSIA ${integerWords(ringgit)}`;
  const withCents =
    cents === 0 ? words : `${words} AND SEN ${integerWords(cents)}`;

  return `${withCents} ONLY`;
}
