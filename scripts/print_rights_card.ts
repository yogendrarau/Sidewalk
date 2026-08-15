/**
 * print_rights_card (§10/§17): icon-first printable rights card + QR onboarding poster
 * (CUP Vendor Power! lineage). Writes SVG to fixtures/media/ — printable, foldable, no reading required.
 * Every legal line carries its citation; the QR points at the PUBLIC_BASE_URL so a judge scans → cold PWA.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import "../server/src/env.js";
import { ROOT } from "../server/src/db.js";
import { env } from "../server/src/env.js";
import { lanIp } from "../server/src/index.js";

const base = env("PUBLIC_BASE_URL", `http://${lanIp()}:${env("PORT", "4477")}`);

async function main() {
  const qrDataUrl = await QRCode.toDataURL(`${base}/?source=poster`, { width: 360, margin: 1, color: { dark: "#14532d", light: "#ffffff" } });

  // ---- Rights card (wallet-size, icon-first, 5 rights + civil/criminal + scam line)
  const rightsCard = `<svg xmlns="http://www.w3.org/2000/svg" width="1050" height="600" font-family="Helvetica, Arial, sans-serif">
  <rect width="1050" height="600" rx="24" fill="#14532d"/>
  <rect x="16" y="16" width="1018" height="568" rx="16" fill="#faf6ef"/>
  <text x="48" y="78" font-size="40" font-weight="900" fill="#14532d">Know your rights · Conozca sus derechos</text>
  <text x="48" y="112" font-size="20" fill="#57534e">NYC street vendors · vendedores ambulantes de NYC</text>

  ${[
    ["🎫", "A civil ticket goes to an OATH hearing. The worst outcome is a fine.", "Una multa civil va a una audiencia de OATH. Lo peor es una multa.", "Local Law 122 of 2025, eff. 2026-03-09"],
    ["💵", "City inspectors NEVER collect money on the street.", "Los inspectores NUNCA cobran dinero en la calle.", "OATH process"],
    ["🪪", "A foreign passport is accepted as ID.", "El pasaporte extranjero se acepta como identificación.", "DOHMH MFV application package"],
    ["🛡️", "No one can sell you a faster license. The real fee is $50 / 2 years.", "Nadie vende una licencia más rápida. La tarifa real es $50 / 2 años.", "DOHMH MFV application package"],
    ["☀️", "In extreme heat you have a right to shade, water, and breaks.", "En calor extremo tiene derecho a sombra, agua y descansos.", "June 2026 executive order"],
  ].map(([icon, en, es, cite], i) => `
    <g transform="translate(48, ${150 + i * 82})">
      <text x="0" y="34" font-size="42">${icon}</text>
      <text x="64" y="24" font-size="21" font-weight="700" fill="#1c1917">${en}</text>
      <text x="64" y="48" font-size="19" fill="#14532d">${es}</text>
      <text x="64" y="68" font-size="12" fill="#a8a29e">§ ${cite}</text>
    </g>`).join("")}

  <line x1="720" y1="150" x2="720" y2="560" stroke="#e7e5e4" stroke-width="2"/>
  <image x="762" y="176" width="230" height="230" href="${qrDataUrl}"/>
  <text x="877" y="440" font-size="22" font-weight="800" fill="#14532d" text-anchor="middle">Scan → free help</text>
  <text x="877" y="466" font-size="18" fill="#57534e" text-anchor="middle">Escanee → ayuda gratis</text>
  <text x="877" y="500" font-size="15" fill="#57534e" text-anchor="middle">🎤 in your language · en su idioma</text>
  <text x="877" y="540" font-size="13" fill="#a8a29e" text-anchor="middle">Sidewalk · no immigration data ever</text>
</svg>`;

  // ---- QR onboarding poster (big, for the demo table)
  const poster = `<svg xmlns="http://www.w3.org/2000/svg" width="820" height="1100" font-family="Helvetica, Arial, sans-serif">
  <rect width="820" height="1100" fill="#14532d"/>
  <rect x="40" y="40" width="740" height="1020" rx="28" fill="#faf6ef"/>
  <text x="410" y="150" font-size="72" font-weight="900" fill="#14532d" text-anchor="middle">Sidewalk</text>
  <text x="410" y="205" font-size="30" fill="#1c1917" text-anchor="middle">Su licencia de vendedor, paso a paso</text>
  <text x="410" y="245" font-size="24" fill="#57534e" text-anchor="middle">Your vendor license, step by step · con voz · gratis</text>
  <rect x="210" y="300" width="400" height="400" rx="20" fill="#fff" stroke="#14532d" stroke-width="8"/>
  <image x="230" y="320" width="360" height="360" href="${qrDataUrl}"/>
  <text x="410" y="770" font-size="40" font-weight="900" fill="#dc2626" text-anchor="middle">📷 Escanee aquí</text>
  <text x="410" y="815" font-size="28" fill="#14532d" text-anchor="middle">Scan with your phone camera</text>
  ${[["🎤", "Pregunte hablando · Ask by voice"], ["🛡️", "Verifique multas · Check tickets"], ["🧾", "Cobre con tarjeta · Accept cards"]].map(([icon, label], i) => `
    <g transform="translate(120, ${880 + i * 58})">
      <text x="0" y="34" font-size="40">${icon}</text>
      <text x="64" y="30" font-size="26" fill="#1c1917">${label}</text>
    </g>`).join("")}
</svg>`;

  writeFileSync(join(ROOT, "fixtures", "media", "rights_card.svg"), rightsCard);
  writeFileSync(join(ROOT, "fixtures", "media", "onboarding_poster.svg"), poster);
  console.log(`Rights card + QR poster written to fixtures/media/`);
  console.log(`  QR target: ${base}/?source=poster`);
  console.log(`  Open fixtures/media/onboarding_poster.svg and scan from a phone on the same LAN.`);
}

await main();
