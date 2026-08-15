import React from "react";
import { AlertTriangle, CheckCircle2, FileImage, Languages, ScanText } from "lucide-react";
import { useSurfaceTranslation } from "@/i18n";

function testKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function confidencePercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `${Math.round(number * 100)}%` : "—";
}

export default function MenuReview({ locale, menuImport, busy, onUpdate, onConfirm }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  if (!menuImport) return null;
  const items = menuImport.items || [];
  const confirmed = menuImport.status === "confirmed";
  return (
    <section data-testid="menu-review" className="menu-review">
      <header className="shopify-section-heading">
        <span className="shopify-section-icon coral"><ScanText size={22} /></span>
        <div><span className="shopify-kicker">02</span><h2>{t("shopify:reviewTitle")}</h2><p>{t("shopify:reviewIntro")}</p></div>
      </header>
      <div className="menu-review-list">
        {items.map((item, index) => {
          const id = testKey(item.localItemKey || index);
          const duplicate = item.needsConfirmation?.includes("likely_duplicate");
          const translatedName = item.localizedNames?.[locale] || item.originalName || "";
          return (
            <article data-testid={`menu-item-${id}`} className={item.priceAmount ? "" : "uncertain"} key={item.localItemKey || index}>
              <header>
                <div><span>{String(index + 1).padStart(2, "0")}</span><strong>{item.originalName || t("shopify:reviewTitle")}</strong></div>
                <span className="confidence-pill"><ScanText size={13} /> {confidencePercent(item.confidence?.name)}</span>
              </header>
              <div className="menu-item-fields">
                <label>
                  <span>{t("shopify:originalText")}</span>
                  <input
                    data-testid={`menu-name-${id}`}
                    value={item.originalName || ""}
                    onChange={(event) => onUpdate(item.localItemKey, { originalName: event.target.value })}
                  />
                </label>
                <label>
                  <span><Languages size={13} /> {t("shopify:translatedText")}</span>
                  <input value={translatedName} readOnly />
                </label>
                <label className="menu-price-field">
                  <span>{t("shopify:price")}</span>
                  <span className="price-input-wrap" dir="ltr"><bdi>$</bdi><input
                    data-testid={`menu-price-${id}`}
                    inputMode="decimal"
                    value={item.priceAmount || ""}
                    placeholder={t("shopify:unclearPrice")}
                    onChange={(event) => onUpdate(item.localItemKey, { priceAmount: event.target.value, priceConfirmed: false })}
                  /></span>
                </label>
              </div>
              <div className="menu-item-review-row">
                <span><FileImage size={14} /> {t("shopify:sourcePhotos")}: <bdi dir="ltr">{item.sourceImageIds?.join(", ")}</bdi></span>
                {!item.priceAmount && <span className="unclear"><AlertTriangle size={14} /> {t("shopify:unclearPrice")}</span>}
              </div>
              {duplicate && (
                <label data-testid="duplicate-resolution" className="duplicate-resolution">
                  <span><AlertTriangle size={15} /> {t("shopify:likelyDuplicate")}</span>
                  <select value={item.duplicateResolution || ""} onChange={(event) => onUpdate(item.localItemKey, { duplicateResolution: event.target.value })}>
                    <option value="">—</option>
                    <option value="merge">{t("shopify:keepOne")}</option>
                    <option value="keep">{t("shopify:originalText")}</option>
                  </select>
                </label>
              )}
              <label className="confirm-price-row">
                <input
                  data-testid={`confirm-price-${id}`}
                  type="checkbox"
                  checked={item.priceConfirmed === true}
                  disabled={!item.priceAmount}
                  onChange={(event) => onUpdate(item.localItemKey, { priceConfirmed: event.target.checked })}
                />
                <span>{t("shopify:confirmPrice")}</span>
              </label>
            </article>
          );
        })}
      </div>
      <button
        data-testid="confirm-menu-import"
        className="shopify-primary wide"
        type="button"
        disabled={busy || confirmed}
        onClick={onConfirm}
      >
        <CheckCircle2 size={17} /> {confirmed ? t("shopify:menuConfirmed") : t("shopify:confirmMenu")}
      </button>
    </section>
  );
}

