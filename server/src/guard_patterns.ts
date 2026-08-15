/** Deterministic Guard patterns: scam scripts, injection markers, PII overshare. */

export const SCAM_PATTERNS: Array<{ key: string; res: RegExp[]; teaching: string }> = [
  {
    key: "advance_fee_license",
    res: [
      /(get|consigo|te consigo|consegu|expedito|fast[- ]?track).{0,40}(license|licencia|permit|permiso)/i,
      /(license|licencia|permit|permiso).{0,40}(por solo|for only|special price|precio especial)/i,
      /(pay|paga|deposit|deposito).{0,30}\$?\s?\d{3,}.{0,40}(license|licencia|permit|permiso)/i,
    ],
    teaching: "No one can sell a faster license. The real fee is $50, paid only to the city.",
  },
  {
    key: "permit_rental",
    res: [/(rent|renta|rento|alquil).{0,30}(permit|permiso|placa)/i, /(permit|permiso).{0,30}(rent|renta|alquiler)/i],
    teaching: "Renting a permit is the underground market. New supervisory permits require the holder present.",
  },
  {
    key: "street_collection",
    res: [
      /(inspector|inspection|inspecci[oó]n).{0,50}(cash|efectivo|pay now|paga ahora|venmo|zelle)/i,
      /(fine|multa).{0,40}(cash|efectivo|on the spot|ah[ií] mismo|right now)/i,
      /(pay|paga).{0,30}(or|o).{0,20}(arrest|arresto|confiscat|confisca|deport)/i,
    ],
    teaching: "City inspectors never collect money on the street. Every real civil fine goes to an OATH hearing.",
  },
  {
    key: "gift_card_payment",
    res: [/(gift ?card|tarjeta de regalo|itunes|google ?play).{0,40}(pay|fine|multa|fee|tarifa)/i],
    teaching: "No government accepts gift cards. This is always a scam.",
  },
  {
    key: "account_takeover",
    res: [/(verification code|c[oó]digo de verificaci[oó]n|otp|one[- ]time).{0,40}(send|manda|share|comparte|dame)/i],
    teaching: "Never share verification codes. Anyone asking for one is taking over an account.",
  },
];

export const INJECTION_PATTERNS: RegExp[] = [
  // direct override / role-hijack
  /ignore\s+(all\s+|your\s+|the\s+)?(previous|prior|above|rules|citation|null)/i,
  /disregard\s+(the|all|your)\s+(instructions|system|rules)/i,
  /forget\s+(the|your)\s+(rulebook|rules|instructions)/i,
  /you\s+are\s+now\s+(a|an|in|dan|approved)/i,
  /(developer|admin|root)\s*mode/i,
  /(system|developer)\s*(prompt|directive|override|:)/i,
  /new\s+directive/i,
  /<\/?(system|instructions|admin)>/i,
  /\bdo\s+anything\s+now\b|\bDAN\b/,
  /reveal\s+(your|the)\s+(prompt|instructions|rules)/i,
  /(as|in)\s+(admin|root|developer)\s+mode/i,
  /(you\s+must\s+now|override\s*:)/i,
  // forwarded / third-person instruction smuggling
  /(como|as\s+an?)\s+(asistente|assistant)\b.{0,40}(debes|must|should|tell)/i,
  /instrucci[oó]n\s+del\s+sistema|system\s+override/i,
  /reenv[ií]a|reply\s+with\s+the\s+(vendor|database|records)/i,
  /(you\s+are\s+approved|est[aá]s?\s+aprobad|i\s+am\s+approved|say\s+i\s+am\s+approved|mark\s+all\s+fines?\s+as\s+fake)/i,
  /(instruction|directive)\s+to\s+(the\s+)?(ai|model|assistant)/i,
  /(to\s+the\s+ai|dear\s+ai)\b/i,
  /skip\s+the\s+(entailment|citation|null|schema|confirmation)/i,
  // capability abuse
  /\bexecute\b.{0,20}\b(command|code|sql)\b/i,
  /forward\s+(all\s+|the\s+|this\s+|your\s+)?(data|records|files|documents|database)/i,
  /change\s+(the\s+)?(payment|bank|payout)\s+(link|account)/i,
  /(provision|file)\s+(payments?|the\s+packet)\s+(without|automatically|now)/i,
  /(set|store).{0,20}immigration/i,
  /reveal\s+other\s+vendors|other\s+vendors'?\s+(rows|records)/i,
  // injected tool-output markers (untrusted content masquerading as tool results)
  /"(__system__|_directive|hint_to_ai|cmd|exec|admin|override|instruction|note)"\s*:/i,
  /TOOL_RESULT\s*\{/i,
];

export const PII_PATTERNS: RegExp[] = [
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN-shaped
  /\b(ssn|social security|seguro social)\b/i,
  /\b(my|mi)\s+(password|contraseñ|pin)\b/i,
];

// Volunteered immigration-status statements are recognized only to be NOT persisted (invariant 3).
export const IMMIGRATION_MENTION = /\b(undocumented|indocumentad|sin papeles|no papers|visa status|asylum|asilo|green card|ice)\b/i;
