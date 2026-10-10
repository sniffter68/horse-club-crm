export const DEFAULT_LEAD_CONSENT_VERSION = '2026-09-19';

export const currentLeadConsentVersion = (): string =>
  process.env.LEAD_CONSENT_VERSION?.trim() || DEFAULT_LEAD_CONSENT_VERSION;
