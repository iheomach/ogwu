'use strict';

/**
 * Lightweight in-memory TTL cache.
 * Single-process only — sufficient for a single-server Express deployment.
 * Swap for Redis (ioredis) if horizontal scaling is ever needed.
 */

const store = new Map();

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function del(key) {
  store.delete(key);
}

module.exports = { get, set, del };
