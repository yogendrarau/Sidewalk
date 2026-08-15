/**
 * Offline-first account-role adapter for the SIDEWALK marketplace prototype.
 *
 * Public API:
 * - pending role: save/read/clearPendingMarketplaceRole
 * - immediate local account: create/load/clearPrototypeMarketplaceAccount
 * - best-effort Base44 sync: sync/hydrateMarketplaceAccount
 * - convenience mutations: saveMarketplaceAccountRole/updateMarketplaceAccountLocale
 * - immediate local logout with background cleanup: logoutMarketplaceAccount
 *
 * The stored prototype record is deliberately closed: random id, role, locale,
 * version, timestamps, and the fictional marker. Unknown properties are rejected.
 * The built-in Base44 User.role is never read or changed here.
 */

export const MARKETPLACE_ACCOUNT_ROLES = Object.freeze(["buyer", "vendor"]);
export const MARKETPLACE_ACCOUNT_LOCALES = Object.freeze([
  "en",
  "es",
  "wo",
  "ar",
  "bn",
  "zh-Hans",
  "fr",
]);
export const PROTOTYPE_ACCOUNT_STORAGE_KEY =
  "sidewalk-marketplace-prototype-account-v1";
export const PENDING_ACCOUNT_ROLE_STORAGE_KEY =
  "sidewalk-marketplace-pending-role-v1";

const SCHEMA_VERSION = 1;
const DEFAULT_LOCALE = "es";
const SYNC_FUNCTION = "sync_marketplace_account";
const DEFAULT_SYNC_TIMEOUT_MS = 1_500;
const PROTOTYPE_ID_PATTERN = /^proto_[0-9a-f]{32}$/;
const RECORD_KEYS = Object.freeze([
  "schema_version",
  "prototype_account_id",
  "account_role",
  "locale",
  "is_fictional",
  "created_at",
  "updated_at",
]);

/** @typedef {"buyer" | "vendor"} MarketplaceAccountRole */
/** @typedef {"en" | "es" | "wo" | "ar" | "bn" | "zh-Hans" | "fr"} MarketplaceAccountLocale */

/**
 * @typedef {Object} StorageLike
 * @property {(key: string) => string | null} getItem
 * @property {(key: string, value: string) => void} setItem
 * @property {(key: string) => void} removeItem
 */

/**
 * @typedef {Object} PrototypeAccountRecord
 * @property {1} schema_version
 * @property {string} prototype_account_id
 * @property {MarketplaceAccountRole} account_role
 * @property {MarketplaceAccountLocale} locale
 * @property {true} is_fictional
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @typedef {Object} MarketplaceAccountView
 * @property {string | null} id
 * @property {string | null} prototype_account_id
 * @property {MarketplaceAccountRole} role
 * @property {MarketplaceAccountRole} account_role
 * @property {MarketplaceAccountLocale} locale
 * @property {string} display_name
 * @property {string | null} created_at
 * @property {string | null} updated_at
 * @property {true} is_fictional
 * @property {true} is_prototype
 * @property {string} persistence
 * @property {string} sync_status
 * @property {string} [sync_error_code]
 */

/**
 * @typedef {Object} AccountViewOptions
 * @property {string} [persistence]
 * @property {string} [syncStatus]
 * @property {string} [syncErrorCode]
 */

/**
 * @typedef {Object} CreateRecordOptions
 * @property {string} [locale]
 * @property {Date | string | number | (() => Date | string | number)} [now]
 * @property {() => string} [idFactory]
 * @property {string} [prototypeAccountId]
 * @property {Date | string | number} [createdAt]
 */

/**
 * @typedef {CreateRecordOptions & Object} AdapterOptions
 * @property {StorageLike | null} [storage]
 * @property {any} [client]
 * @property {number} [timeoutMs]
 * @property {boolean} [sync]
 */

/**
 * @typedef {AdapterOptions & Object} LogoutOptions
 * @property {MarketplaceAccountView | null} [account]
 * @property {boolean} [logoutBase44]
 * @property {string} [redirectUrl]
 */

/** @returns {StorageLike | null} */
function getDefaultStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** @param {StorageLike | null | undefined} storage @returns {StorageLike | null} */
function resolveStorage(storage) {
  return storage === undefined ? getDefaultStorage() : storage;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return keys.length === expected.length &&
    keys.every((key, index) => key === expected[index]);
}

/** @param {unknown} value @returns {string | null} */
function normalizeTimestamp(value) {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString();
}

/** @param {Date | string | number | (() => Date | string | number) | undefined} now */
function timestampFrom(now) {
  const value = typeof now === "function" ? now() : (now ?? new Date());
  const normalized = normalizeTimestamp(value);
  if (!normalized) throw new TypeError("A valid account timestamp is required.");
  return normalized;
}

function resolveRoleInput(input) {
  if (typeof input === "string") return input;
  if (!isPlainObject(input)) return null;
  return input.account_role ?? input.role ?? null;
}

function resolveLocaleInput(input, explicitLocale) {
  if (explicitLocale !== undefined) return explicitLocale;
  return isPlainObject(input) ? input.locale : undefined;
}

/**
 * @param {PrototypeAccountRecord} record
 * @param {StorageLike | null | undefined} storage
 */
function writePrototypeRecord(record, storage) {
  const target = resolveStorage(storage);
  if (!target?.setItem) return false;
  try {
    target.setItem(PROTOTYPE_ACCOUNT_STORAGE_KEY, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

/** @param {StorageLike | null} target @param {string} key */
function safeRemove(target, key) {
  if (!target?.removeItem) return false;
  try {
    if (target.getItem && target.getItem(key) === null) return false;
    target.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** @param {MarketplaceAccountRole} role */
function prototypeLabel(role) {
  return role === "buyer" ? "Prototype buyer" : "Prototype vendor";
}

/**
 * @param {PrototypeAccountRecord} record
 * @param {AccountViewOptions} [options]
 * @returns {Readonly<MarketplaceAccountView>}
 */
function toPrototypeView(
  record,
  {
    persistence = "prototype_local",
    syncStatus = "local_only",
    syncErrorCode,
  } = {},
) {
  return Object.freeze({
    id: record.prototype_account_id,
    prototype_account_id: record.prototype_account_id,
    role: record.account_role,
    account_role: record.account_role,
    locale: record.locale,
    display_name: prototypeLabel(record.account_role),
    created_at: record.created_at,
    updated_at: record.updated_at,
    is_fictional: true,
    is_prototype: true,
    persistence,
    sync_status: syncStatus,
    ...(syncErrorCode ? { sync_error_code: syncErrorCode } : {}),
  });
}

/**
 * @param {any} user
 * @param {MarketplaceAccountView | null | undefined} localAccount
 * @returns {Readonly<MarketplaceAccountView> | null}
 */
function toAuthenticatedView(user, localAccount) {
  const role = normalizeMarketplaceAccountRole(user?.account_role);
  if (!role) return null;
  const createdAt = normalizeTimestamp(user?.created_date) ?? localAccount?.created_at;
  const updatedAt = normalizeTimestamp(user?.updated_date) ??
    localAccount?.updated_at ?? createdAt;
  return Object.freeze({
    id: typeof user?.id === "string" ? user.id : localAccount?.id,
    prototype_account_id: localAccount?.prototype_account_id ?? null,
    role,
    account_role: role,
    locale: localAccount?.locale ?? DEFAULT_LOCALE,
    display_name: role === "buyer" ? "Prototype buyer" : "Prototype vendor",
    created_at: createdAt,
    updated_at: updatedAt,
    is_fictional: true,
    is_prototype: true,
    persistence: "base44_user",
    sync_status: "synced",
  });
}

/** @param {unknown} account @returns {PrototypeAccountRecord | null} */
function recordFromAccount(account) {
  if (!isPlainObject(account)) return null;
  return parsePrototypeAccountRecord({
    schema_version: SCHEMA_VERSION,
    prototype_account_id: account.prototype_account_id ?? account.id,
    account_role: account.account_role ?? account.role,
    locale: account.locale,
    is_fictional: true,
    created_at: account.created_at,
    updated_at: account.updated_at,
  });
}

function unwrapFunctionResult(result) {
  if (isPlainObject(result) && "ok" in result) return result;
  return isPlainObject(result?.data) ? result.data : result;
}

async function resolveClient(client) {
  if (client) return client;
  const module = await import("../api/base44Client.js");
  return module.base44;
}

function withTimeout(promise, timeoutMs) {
  const duration = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_SYNC_TIMEOUT_MS;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("marketplace_sync_timeout")), duration);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function invokeSync(client, input, timeoutMs) {
  if (!client?.functions?.invoke) throw new Error("base44_function_unavailable");
  const response = await withTimeout(
    client.functions.invoke(SYNC_FUNCTION, input),
    timeoutMs,
  );
  const result = unwrapFunctionResult(response);
  if (!isPlainObject(result) || result.ok !== true) {
    throw new Error("base44_function_failed");
  }
  return result;
}

/** @param {unknown} value @returns {value is MarketplaceAccountRole} */
export function isMarketplaceAccountRole(value) {
  return typeof value === "string" &&
    /** @type {readonly string[]} */ (MARKETPLACE_ACCOUNT_ROLES).includes(value);
}

/** @param {unknown} value @returns {MarketplaceAccountRole | null} */
export function normalizeMarketplaceAccountRole(value) {
  return isMarketplaceAccountRole(value) ? value : null;
}

/** @param {unknown} value @returns {value is MarketplaceAccountLocale} */
export function isMarketplaceAccountLocale(value) {
  return typeof value === "string" &&
    /** @type {readonly string[]} */ (MARKETPLACE_ACCOUNT_LOCALES).includes(value);
}

/**
 * @param {unknown} value
 * @param {MarketplaceAccountLocale} [fallback]
 * @returns {MarketplaceAccountLocale}
 */
export function normalizeMarketplaceAccountLocale(value, fallback = DEFAULT_LOCALE) {
  return isMarketplaceAccountLocale(value) ? value : fallback;
}

/** @param {Crypto} [cryptoSource] @returns {string} */
export function createPrototypeAccountId(cryptoSource = globalThis.crypto) {
  if (typeof cryptoSource?.randomUUID === "function") {
    return `proto_${cryptoSource.randomUUID().replaceAll("-", "").toLowerCase()}`;
  }
  if (typeof cryptoSource?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoSource.getRandomValues(bytes);
    return `proto_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  throw new Error("Secure random account ids are unavailable.");
}

/**
 * @param {MarketplaceAccountRole | {role?: unknown, account_role?: unknown, locale?: unknown}} input
 * @param {CreateRecordOptions} [options]
 * @returns {Readonly<PrototypeAccountRecord>}
 */
export function createPrototypeAccountRecord(
  input,
  {
    locale,
    now,
    idFactory = createPrototypeAccountId,
    prototypeAccountId,
    createdAt,
  } = {},
) {
  const accountRole = normalizeMarketplaceAccountRole(resolveRoleInput(input));
  if (!accountRole) throw new TypeError("Account role must be buyer or vendor.");

  const accountLocale = normalizeMarketplaceAccountLocale(
    resolveLocaleInput(input, locale),
  );
  const updatedAt = timestampFrom(now);
  const normalizedCreatedAt = createdAt
    ? normalizeTimestamp(createdAt)
    : updatedAt;
  if (!normalizedCreatedAt) throw new TypeError("A valid creation timestamp is required.");

  const generatedId = prototypeAccountId ?? idFactory();
  if (typeof generatedId !== "string" || !PROTOTYPE_ID_PATTERN.test(generatedId)) {
    throw new TypeError("Prototype account id is invalid.");
  }

  return Object.freeze({
    schema_version: SCHEMA_VERSION,
    prototype_account_id: generatedId,
    account_role: accountRole,
    locale: accountLocale,
    is_fictional: true,
    created_at: normalizedCreatedAt,
    updated_at: updatedAt,
  });
}

/** @param {unknown} raw @returns {Readonly<PrototypeAccountRecord> | null} */
export function parsePrototypeAccountRecord(raw) {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  if (!isPlainObject(value) || !hasExactKeys(value, RECORD_KEYS)) return null;
  if (value.schema_version !== SCHEMA_VERSION || value.is_fictional !== true) {
    return null;
  }
  if (
    typeof value.prototype_account_id !== "string" ||
    !PROTOTYPE_ID_PATTERN.test(value.prototype_account_id) ||
    !isMarketplaceAccountRole(value.account_role) ||
    !isMarketplaceAccountLocale(value.locale)
  ) {
    return null;
  }

  const createdAt = normalizeTimestamp(value.created_at);
  const updatedAt = normalizeTimestamp(value.updated_at);
  if (!createdAt || !updatedAt) return null;

  return Object.freeze({
    schema_version: SCHEMA_VERSION,
    prototype_account_id: value.prototype_account_id,
    account_role: value.account_role,
    locale: value.locale,
    is_fictional: true,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

/**
 * @param {StorageLike | null} [storage]
 * @returns {Readonly<PrototypeAccountRecord> | null}
 */
export function readPrototypeMarketplaceAccount(storage) {
  const target = resolveStorage(storage);
  if (!target?.getItem) return null;
  let raw;
  try {
    raw = target.getItem(PROTOTYPE_ACCOUNT_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const record = parsePrototypeAccountRecord(raw);
  if (!record) safeRemove(target, PROTOTYPE_ACCOUNT_STORAGE_KEY);
  return record;
}

/**
 * @param {MarketplaceAccountRole | {role?: unknown, account_role?: unknown, locale?: unknown}} input
 * @param {AdapterOptions} [options]
 * @returns {Readonly<MarketplaceAccountView>}
 */
export function createPrototypeMarketplaceAccount(input, options = {}) {
  const storage = resolveStorage(options.storage);
  const existing = readPrototypeMarketplaceAccount(storage);
  const record = createPrototypeAccountRecord(input, {
    locale: options.locale,
    now: options.now,
    idFactory: options.idFactory,
    prototypeAccountId: existing?.prototype_account_id,
    createdAt: existing?.created_at,
  });
  const persisted = writePrototypeRecord(record, storage);
  clearPendingMarketplaceRole(storage);
  return toPrototypeView(record, {
    persistence: persisted ? "prototype_local" : "prototype_memory",
    syncStatus: persisted ? "local_only" : "not_persisted",
  });
}

/** @param {StorageLike | null} [storage] @returns {MarketplaceAccountRole | null} */
export function readPendingMarketplaceRole(storage) {
  const target = resolveStorage(storage);
  if (!target?.getItem) return null;
  let raw;
  try {
    raw = target.getItem(PENDING_ACCOUNT_ROLE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (
      !isPlainObject(value) ||
      !hasExactKeys(value, ["account_role", "selected_at"]) ||
      !isMarketplaceAccountRole(value.account_role) ||
      !normalizeTimestamp(value.selected_at)
    ) {
      safeRemove(target, PENDING_ACCOUNT_ROLE_STORAGE_KEY);
      return null;
    }
    return value.account_role;
  } catch {
    safeRemove(target, PENDING_ACCOUNT_ROLE_STORAGE_KEY);
    return null;
  }
}

/**
 * @param {unknown} role
 * @param {StorageLike | null} [storage]
 * @param {Date | string | number | (() => Date | string | number)} [now]
 * @returns {MarketplaceAccountRole}
 */
export function savePendingMarketplaceRole(role, storage, now) {
  const accountRole = normalizeMarketplaceAccountRole(role);
  if (!accountRole) throw new TypeError("Account role must be buyer or vendor.");
  const target = resolveStorage(storage);
  if (!target?.setItem) return accountRole;
  try {
    target.setItem(PENDING_ACCOUNT_ROLE_STORAGE_KEY, JSON.stringify({
      account_role: accountRole,
      selected_at: timestampFrom(now),
    }));
  } catch {
    // The role remains usable in current UI state even if browser storage is unavailable.
  }
  return accountRole;
}

/** @param {StorageLike | null} [storage] */
export function clearPendingMarketplaceRole(storage) {
  return safeRemove(resolveStorage(storage), PENDING_ACCOUNT_ROLE_STORAGE_KEY);
}

/**
 * @param {{storage?: StorageLike | null}} [options]
 * @returns {Readonly<MarketplaceAccountView> | null}
 */
export function loadMarketplaceAccount({ storage } = {}) {
  const record = readPrototypeMarketplaceAccount(storage);
  return record ? toPrototypeView(record) : null;
}

/**
 * @param {MarketplaceAccountView} account
 * @param {AdapterOptions} [options]
 * @returns {Promise<Readonly<MarketplaceAccountView>>}
 */
export async function syncMarketplaceAccount(
  account,
  {
    client: requestedClient,
    storage,
    timeoutMs = DEFAULT_SYNC_TIMEOUT_MS,
  } = {},
) {
  const record = recordFromAccount(account);
  if (!record) throw new TypeError("A valid prototype account is required.");
  const client = await resolveClient(requestedClient);
  let authenticatedView = null;

  try {
    if (client?.auth?.me && client?.auth?.updateMe) {
      const currentUser = await withTimeout(client.auth.me(), timeoutMs);
      if (!currentUser) throw new Error("base44_user_unavailable");
      const updatedUser = await withTimeout(
        client.auth.updateMe({ account_role: record.account_role }),
        timeoutMs,
      );
      const nextAuthenticatedView = toAuthenticatedView(updatedUser, account);
      if (nextAuthenticatedView) {
        // Keep the authenticated routing role, but continue through the
        // synthetic-record upsert below. Shopify's session-scoped vendor gate
        // uses MarketplacePrototypeAccount to bind this opaque prototype id.
        // Returning here would leave every certification action unauthorized.
        authenticatedView = nextAuthenticatedView;
      }
    }
  } catch {
    // Continue to the synthetic Base44 record; local state already exists.
  }

  try {
    const result = await invokeSync(client, {
      action: "upsert",
      prototype_account_id: record.prototype_account_id,
      account_role: record.account_role,
      locale: record.locale,
      schema_version: SCHEMA_VERSION,
      is_fictional: true,
      created_at: record.created_at,
    }, timeoutMs);
    const syncedRecord = parsePrototypeAccountRecord(result.data);
    if (!syncedRecord) throw new Error("invalid_base44_account_response");
    writePrototypeRecord(syncedRecord, storage);
    if (authenticatedView) {
      return Object.freeze({
        ...authenticatedView,
        locale: syncedRecord.locale,
        created_at: syncedRecord.created_at,
        updated_at: syncedRecord.updated_at,
        sync_status: "synced",
      });
    }
    return toPrototypeView(syncedRecord, {
      persistence: "base44_synthetic_and_local",
      syncStatus: "synced",
    });
  } catch {
    if (authenticatedView) {
      return Object.freeze({
        ...authenticatedView,
        sync_status: "account_only",
        sync_error_code: "synthetic_account_unavailable",
      });
    }
    return toPrototypeView(record, {
      persistence: "prototype_local",
      syncStatus: "local_only",
      syncErrorCode: "base44_unavailable",
    });
  }
}

/**
 * @param {AdapterOptions} [options]
 * @returns {Promise<Readonly<MarketplaceAccountView> | null>}
 */
export async function hydrateMarketplaceAccount(
  {
    client: requestedClient,
    storage,
    timeoutMs = DEFAULT_SYNC_TIMEOUT_MS,
  } = {},
) {
  const localAccount = loadMarketplaceAccount({ storage });
  const client = await resolveClient(requestedClient);

  try {
    if (client?.auth?.me) {
      const user = await withTimeout(client.auth.me(), timeoutMs);
      if (!user) throw new Error("base44_user_unavailable");
      const profileView = toAuthenticatedView(user, localAccount);
      if (localAccount) {
        // A Base44 profile role alone is not enough for the Shopify POC:
        // refreshes must also repair/upsert the synthetic account that binds
        // the opaque prototype id to the vendor demo session.
        return await syncMarketplaceAccount(profileView ?? localAccount, {
          client,
          storage,
          timeoutMs,
        });
      }
      // Never hydrate a role-only Base44 profile into a broken marketplace
      // account with a null prototype id. With no local no-PII record, the
      // user returns to the explicit role/onboarding choice below.
      if (profileView) return null;
    }
  } catch {
    // The local account remains the usable source for this offline-first flow.
  }

  if (!localAccount) return null;
  try {
    const result = await invokeSync(client, {
      action: "get",
      prototype_account_id: localAccount.prototype_account_id,
    }, timeoutMs);
    const remoteRecord = result.data
      ? parsePrototypeAccountRecord(result.data)
      : null;
    if (!remoteRecord) return localAccount;
    writePrototypeRecord(remoteRecord, storage);
    return toPrototypeView(remoteRecord, {
      persistence: "base44_synthetic_and_local",
      syncStatus: "synced",
    });
  } catch {
    return localAccount;
  }
}

/**
 * @param {MarketplaceAccountRole} role
 * @param {AdapterOptions} [options]
 */
export function saveMarketplaceAccountRole(role, options = {}) {
  const account = createPrototypeMarketplaceAccount({
    role,
    locale: options.locale,
  }, options);
  const sync = options.sync === false
    ? Promise.resolve(account)
    : syncMarketplaceAccount(account, options);
  return Object.freeze({ account, sync });
}

/**
 * @param {unknown} locale
 * @param {AdapterOptions} [options]
 */
export function updateMarketplaceAccountLocale(locale, options = {}) {
  if (!isMarketplaceAccountLocale(locale)) {
    throw new TypeError("Unsupported marketplace account locale.");
  }
  const current = loadMarketplaceAccount({ storage: options.storage });
  if (!current) return Object.freeze({ account: null, sync: Promise.resolve(null) });
  const account = createPrototypeMarketplaceAccount({
    role: current.account_role,
    locale,
  }, options);
  const sync = options.sync === false
    ? Promise.resolve(account)
    : syncMarketplaceAccount(account, options);
  return Object.freeze({ account, sync });
}

/** @param {StorageLike | null} [storage] */
export function clearPrototypeMarketplaceAccount(storage) {
  const target = resolveStorage(storage);
  const accountCleared = safeRemove(target, PROTOTYPE_ACCOUNT_STORAGE_KEY);
  const pendingCleared = safeRemove(target, PENDING_ACCOUNT_ROLE_STORAGE_KEY);
  return accountCleared || pendingCleared;
}

/** @param {LogoutOptions} [options] */
export function logoutMarketplaceAccount(
  {
    account,
    client: requestedClient,
    storage,
    timeoutMs = DEFAULT_SYNC_TIMEOUT_MS,
    logoutBase44 = false,
    redirectUrl,
  } = {},
) {
  const current = account ?? loadMarketplaceAccount({ storage });
  const prototypeId = current?.prototype_account_id;
  clearPrototypeMarketplaceAccount(storage);

  const sync = (async () => {
    const client = await resolveClient(requestedClient);
    let remoteCleanup = "not_needed";
    if (PROTOTYPE_ID_PATTERN.test(prototypeId ?? "")) {
      try {
        await invokeSync(client, {
          action: "delete",
          prototype_account_id: prototypeId,
        }, timeoutMs);
        remoteCleanup = "deleted";
      } catch {
        remoteCleanup = "unavailable";
      }
    }
    if (logoutBase44 && client?.auth?.logout) {
      client.auth.logout(redirectUrl);
    }
    return Object.freeze({ remote_cleanup: remoteCleanup });
  })();

  return Object.freeze({ account: null, cleared: true, sync });
}
