import React from "react";
import { Camera, FileImage, Images, Sparkles, Trash2 } from "lucide-react";
import { VENDOR_IMAGE_KINDS } from "@/lib/shopifyPoc";
import { useSurfaceTranslation } from "@/i18n";

const KIND_KEYS = {
  menu_or_price_board: "kindMenu",
  product_or_food_photo: "kindFood",
  cart_truck_stand_or_venue: "kindVenue",
  other: "kindOther",
};

function testKey(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

export default function MenuPhotoIntake({
  locale,
  media,
  sampleMode,
  busy,
  onFiles,
  onRemove,
  onKind,
  onApprove,
  onLoadSample,
  onProcess,
}) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  return (
    <section data-testid="menu-photo-intake" className="menu-photo-intake">
      <header className="shopify-section-heading">
        <span className="shopify-section-icon"><Camera size={22} /></span>
        <div><span className="shopify-kicker">01</span><h2>{t("shopify:addMenuPhotos")}</h2><p>{t("shopify:photoWarning")}</p></div>
      </header>
      <div className="shopify-upload-grid">
        <label className="shopify-upload-control">
          <FileImage size={22} />
          <strong>{t("shopify:addMenuPhotos")}</strong>
          <input
            data-testid="menu-photo-input"
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(event) => onFiles(event.target.files)}
          />
        </label>
        <label className="shopify-upload-control">
          <Images size={22} />
          <strong>{t("shopify:addStorefrontPhotos")}</strong>
          <input
            data-testid="storefront-photo-input"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => onFiles(event.target.files)}
          />
        </label>
        <button data-testid="load-shopify-menu-fixtures" className="shopify-upload-control fixture" type="button" onClick={onLoadSample}>
          <Sparkles size={22} /><strong>{t("shopify:loadDemoPhotos")}</strong>
        </button>
      </div>
      {sampleMode && <p className="shopify-sample-note">{t("shopify:sampleExplanation")}</p>}
      {media.length > 0 && (
        <div className="shopify-media-grid">
          {media.map((asset, index) => {
            const id = testKey(asset.id || index);
            const storefrontKind = ["product_or_food_photo", "cart_truck_stand_or_venue"].includes(asset.confirmedKind);
            const suggestionKey = KIND_KEYS[asset.suggestedKind];
            const suggestionMode = asset.classificationProvenance?.mode || asset.provenance?.mode || "unavailable";
            const suggestionBadge = suggestionMode === "live_ai"
              ? t("shopify:aiBadge")
              : suggestionMode === "fixture"
                ? t("shopify:sampleDataBadge")
                : t("shopify:unavailableBadge");
            return (
              <article data-testid={`media-card-${id}`} key={asset.id || index}>
                <img src={asset.previewUrl} alt={asset.fileName || `${t("shopify:imageType")} ${index + 1}`} />
                <div className="shopify-media-body">
                  <strong>{asset.fileName}</strong>
                  {suggestionKey && (
                    <p
                      data-testid={`media-suggestion-${id}`}
                      data-provenance-mode={suggestionMode}
                      className="media-kind-suggestion"
                    >
                      <Sparkles size={13} />
                      <span>{t("shopify:suggestedType")}: {t(`shopify:${suggestionKey}`)}</span>
                      <em>{suggestionBadge}</em>
                    </p>
                  )}
                  <label>
                    <span>{t("shopify:imageType")}</span>
                    <select
                      data-testid={`media-kind-${id}`}
                      value={asset.confirmedKind}
                      onChange={(event) => onKind(asset.id, event.target.value)}
                    >
                      {VENDOR_IMAGE_KINDS.map((kind) => <option key={kind} value={kind}>{t(`shopify:${KIND_KEYS[kind]}`)}</option>)}
                    </select>
                  </label>
                  {storefrontKind && (
                    <label className="shopify-media-approval">
                      <input
                        data-testid={`approve-media-${id}`}
                        type="checkbox"
                        checked={asset.approvedForStorefront === true}
                        onChange={(event) => onApprove(asset.id, event.target.checked)}
                      />
                      <span>{t("shopify:approvePhoto")}</span>
                    </label>
                  )}
                  <button type="button" className="shopify-remove" onClick={() => onRemove(asset.id)}><Trash2 size={14} /> {t("shopify:remove")}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <button
        data-testid="confirm-media-kinds"
        type="button"
        className="shopify-primary wide"
        disabled={!media.length || busy}
        onClick={onProcess}
      >
        <Sparkles size={17} /> {t("shopify:confirmKinds")}
      </button>
    </section>
  );
}
