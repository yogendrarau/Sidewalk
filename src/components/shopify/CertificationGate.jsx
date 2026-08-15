import React, { useEffect, useRef, useState } from "react";
import { BadgeCheck, CircleHelp, LockKeyhole, ShieldCheck, X } from "lucide-react";
import { localeDirection, useSurfaceTranslation } from "@/i18n";

export function CertificationDialog({ locale, open, busy = false, onCancel, onConfirm }) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const [checked, setChecked] = useState(false);
  const checkboxRef = useRef(null);

  useEffect(() => {
    if (!open) {
      setChecked(false);
      return;
    }
    const timer = window.setTimeout(() => checkboxRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;
  return (
    <div className="shopify-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onCancel();
    }}>
      <section
        data-testid="certification-dialog"
        className="shopify-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="certification-dialog-title"
        lang={locale}
        dir={localeDirection(locale)}
      >
        <button className="shopify-icon-button" type="button" onClick={onCancel} disabled={busy} aria-label={t("shopify:cancel")}>
          <X size={18} />
        </button>
        <span className="shopify-dialog-icon"><ShieldCheck size={25} /></span>
        <h2 id="certification-dialog-title">{t("shopify:attestationTitle")}</h2>
        <p>{t("shopify:attestationText")}</p>
        <label className="shopify-confirm-checkbox">
          <input
            ref={checkboxRef}
            data-testid="certification-confirmation"
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
          />
          <span>{t("shopify:checkboxLabel")}</span>
        </label>
        <div className="shopify-dialog-actions">
          <button type="button" className="shopify-secondary" onClick={onCancel} disabled={busy}>{t("shopify:cancel")}</button>
          <button
            data-testid="certification-submit"
            type="button"
            className="shopify-primary"
            disabled={!checked || busy}
            onClick={onConfirm}
          >
            <BadgeCheck size={17} /> {t("shopify:confirm")}
          </button>
        </div>
      </section>
    </div>
  );
}

export default function CertificationGate({
  locale,
  state,
  busyAction,
  onNeedHelp,
  onOpenAttestation,
  onRetry,
}) {
  const { t } = useSurfaceTranslation(locale, ["shopify"]);
  const loading = state.status === "loading";
  return (
    <section
      data-testid="certification-gate"
      data-certification-status={state.certification_status}
      data-selling-access-state={state.selling_access_state}
      className="certification-gate"
    >
      <header>
        <span className="shopify-section-icon"><LockKeyhole size={22} /></span>
        <div>
          <span className="shopify-kicker">{t("shopify:sellingLocked")}</span>
          <h2>{t("shopify:question")}</h2>
          <p>{t("shopify:choiceRequired")}</p>
        </div>
      </header>
      <div className="certification-options">
        <button data-testid="certification-yes" type="button" disabled={loading || Boolean(busyAction)} onClick={onOpenAttestation}>
          <BadgeCheck size={21} /><span>{t("shopify:yesCertified")}</span>
        </button>
        <button
          data-testid="certification-help"
          type="button"
          disabled={loading || Boolean(busyAction)}
          onClick={onNeedHelp}
        >
          <CircleHelp size={21} /><span>{t("shopify:needHelp")}</span>
        </button>
      </div>
      <p className="shopify-policy-note"><ShieldCheck size={15} /> {t("shopify:policyExplanation")}</p>
      {loading && <p data-testid="certification-status-unanswered" className="shopify-inline-state">{t("shopify:loading")}</p>}
      {state.error && (
        <div className="shopify-error" role="alert">
          <span>{t("shopify:actionFailed")}</span>
          <button type="button" onClick={onRetry}>{t("shopify:retry")}</button>
        </div>
      )}
    </section>
  );
}

