/**
 * ARA recommendation banner — structured recommendations + legacy fallback.
 *
 * The ACCESS Resource Advisor (ARA) can deep-link into an RP resource page
 * with `?ara_ref=<opaque id>`. On load we fetch the full recommendation set
 * for that ref from the ARA API and cache it in localStorage under the
 * `ara_recommendations` key, keyed internally by this resource's
 * "resource key" (see drupalSettings.aspTheme.ara.resourceKey, set by
 * aspTheme_preprocess_node__access_active_resources_from_cid() —
 * currently the node's field_access_global_resource_id; that contract with
 * the ARA team is still pending).
 *
 * The fetch URL is built ONLY from drupalSettings.aspTheme.ara.endpoint
 * (theme configuration, defaulting to ASPTHEME_ARA_ENDPOINT_DEFAULT in
 * aspTheme.theme) plus the ref — never from the current URL and never from
 * anything in a fetched payload. That keeps the origin we talk to under
 * theme control regardless of what query string a link sends visitors in
 * with.
 *
 * Legacy fallback: if there's no usable structured recommendation for this
 * resource (no resourceKey, no cached entry, fetch failed, etc.), we fall
 * back to the original behavior: read `?ara_context=` (a free-text string)
 * from the URL, persist it to `ara_recommendation_{nid}`, and show it as
 * plain text. That old behavior is preserved as-is so old ARA links keep
 * working.
 *
 * Every value that comes from the network (description, reason labels) is
 * written to the DOM via textContent/createTextNode only — never innerHTML,
 * never a template string fed to innerHTML — so a hostile payload can never
 * inject markup. Reason `type` is never used as-is in markup or a class
 * name; it's mapped through a hardcoded lookup (REASON_TYPE_LABELS) to a
 * label prefix, and unknown types just render the label with no prefix.
 *
 * On any failure to fetch or validate the payload (non-2xx, network error,
 * non-JSON, or a shape that fails validation) we do nothing destructive:
 * no throw, no console.error (only console.warn — Cypress asserts on
 * console errors, not warnings), and the existing cache/legacy state is
 * left alone so whatever was already showing keeps showing.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'ara_recommendations';
  var STORAGE_VERSION = 1;

  // Independent cap on cache lifetime, regardless of what (if anything) the
  // payload's expires_at says. 14 days.
  var MAX_CACHE_MS = 14 * 24 * 60 * 60 * 1000;

  // Hardcoded lookup from a reason's `type` to a display label prefix.
  // Never derive a class name or markup from `type` directly — only this
  // lookup. Unknown types fall back to the reason's `label` alone.
  var REASON_TYPE_LABELS = {
    hardware: 'Hardware',
    software: 'Software',
    history: 'History',
  };

  function warn() {
    if (window.console && console.warn) {
      console.warn.apply(console, arguments);
    }
  }

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function isValidReason(reason) {
    return isPlainObject(reason)
      && typeof reason.type === 'string'
      && typeof reason.label === 'string';
  }

  /**
   * Validates the top-level payload shape: a plain object with a
   * `resources` plain object. Anything else is rejected outright.
   */
  function isValidPayload(data) {
    return isPlainObject(data) && isPlainObject(data.resources);
  }

  /**
   * Builds a clean resources map, dropping any entry that doesn't match the
   * expected shape rather than rendering it partially.
   */
  function sanitizeResources(resourcesRaw) {
    var out = {};
    Object.keys(resourcesRaw).forEach(function (key) {
      var entry = resourcesRaw[key];
      if (!isPlainObject(entry)) {
        return;
      }
      if (typeof entry.description !== 'string') {
        return;
      }
      if (!Array.isArray(entry.reasons)) {
        return;
      }
      var reasons = entry.reasons.filter(isValidReason).map(function (reason) {
        return { type: reason.type, label: reason.label };
      });
      var clean = { description: entry.description, reasons: reasons };
      if (typeof entry.score === 'number') {
        clean.score = entry.score;
      }
      out[key] = clean;
    });
    return out;
  }

  /**
   * Reads and validates the cache. Deletes and returns null if missing,
   * malformed, or expired.
   */
  function readCache() {
    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    }
    catch (e) {
      return null;
    }
    if (!raw) {
      return null;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    }
    catch (e) {
      return null;
    }
    if (!isPlainObject(parsed) || !isPlainObject(parsed.resources)
      || typeof parsed.expiresAt !== 'number') {
      return null;
    }
    if (Date.now() >= parsed.expiresAt) {
      try {
        localStorage.removeItem(STORAGE_KEY);
      }
      catch (e) {
        // Ignore.
      }
      return null;
    }
    return parsed;
  }

  function writeCache(record) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    }
    catch (e) {
      warn('ARA recommendation cache write failed', e);
    }
  }

  /**
   * Fetches the recommendation set for `ref` and caches it. Always calls
   * `done` afterward (success or failure) and never throws or leaves a
   * rejection unhandled.
   */
  function fetchAndCache(ref, endpoint, done) {
    var url = endpoint + encodeURIComponent(ref);
    fetch(url, { credentials: 'omit' })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('ARA recommendations HTTP ' + response.status);
        }
        return response.json();
      })
      .then(function (data) {
        if (!isValidPayload(data)) {
          warn('ARA recommendations payload failed validation');
          done();
          return;
        }
        var fetchedAt = Date.now();
        var maxExpiresAt = fetchedAt + MAX_CACHE_MS;
        var expiresAt = maxExpiresAt;
        if (typeof data.expires_at === 'string') {
          var parsed = Date.parse(data.expires_at);
          if (!isNaN(parsed)) {
            expiresAt = Math.min(parsed, maxExpiresAt);
          }
        }
        writeCache({
          version: STORAGE_VERSION,
          ref: ref,
          fetchedAt: fetchedAt,
          expiresAt: expiresAt,
          resources: sanitizeResources(data.resources),
        });
        done();
      })
      .catch(function (err) {
        warn('ARA recommendations fetch failed', err);
        done();
      });
  }

  function init() {
    var banner = document.getElementById('ara-recommendation-banner');
    if (!banner) {
      return;
    }
    var textEl = document.getElementById('ara-recommendation-text');
    var dismissBtn = document.getElementById('ara-dismiss');
    var nodeId = banner.getAttribute('data-node-id') || '';
    var legacyKey = 'ara_recommendation_' + nodeId;

    var settings = (window.drupalSettings
      && drupalSettings.aspTheme
      && drupalSettings.aspTheme.ara) || {};
    var endpoint = typeof settings.endpoint === 'string' && settings.endpoint
      ? settings.endpoint
      : null;
    var resourceKey = typeof settings.resourceKey === 'string' && settings.resourceKey
      ? settings.resourceKey
      : null;

    var params = new URLSearchParams(window.location.search);
    var araRef = params.get('ara_ref');

    // Tracks which source fed the currently-visible banner so Dismiss knows
    // what to clear: the structured cache entry for this resource, or the
    // legacy context string.
    var activeSource = null;

    function clearReasons() {
      var existing = document.getElementById('ara-recommendation-reasons');
      if (existing && existing.parentNode) {
        existing.parentNode.removeChild(existing);
      }
    }

    function renderReasons(reasons) {
      clearReasons();
      if (!reasons || !reasons.length) {
        return;
      }
      var list = document.createElement('ul');
      list.id = 'ara-recommendation-reasons';
      list.className = 'list-disc ml-5 mt-2 text-sm';
      reasons.forEach(function (reason) {
        var item = document.createElement('li');
        var prefix = REASON_TYPE_LABELS[reason.type];
        var text = prefix ? (prefix + ': ' + reason.label) : reason.label;
        item.appendChild(document.createTextNode(text));
        list.appendChild(item);
      });
      // Insert above the Dismiss button so the reasons read as part of the
      // banner body rather than as something after its action.
      if (dismissBtn && dismissBtn.parentNode === banner) {
        banner.insertBefore(list, dismissBtn);
      }
      else {
        banner.appendChild(list);
      }
    }

    function renderStructured(entry) {
      textEl.textContent = '';
      textEl.appendChild(document.createTextNode(entry.description || ''));
      renderReasons(entry.reasons);
      banner.classList.remove('hidden');
      activeSource = 'structured';
    }

    function renderLegacy(text) {
      textEl.textContent = '';
      textEl.appendChild(document.createTextNode(text));
      renderReasons(null);
      banner.classList.remove('hidden');
      activeSource = 'legacy';
    }

    /**
     * Renders from whatever state is currently available: the structured
     * cache first (if this resource has an entry), else the legacy
     * ara_context string. Leaves the banner untouched (hidden) if neither
     * source has anything.
     */
    function renderFromState() {
      var cache = readCache();
      if (resourceKey && cache
        && Object.prototype.hasOwnProperty.call(cache.resources, resourceKey)) {
        renderStructured(cache.resources[resourceKey]);
        return;
      }

      var araContext = params.get('ara_context');
      if (araContext) {
        try {
          localStorage.setItem(legacyKey, araContext);
        }
        catch (e) {
          // Ignore; still render for this pageview.
        }
        renderLegacy(araContext);
        return;
      }

      var stored;
      try {
        stored = localStorage.getItem(legacyKey);
      }
      catch (e) {
        stored = null;
      }
      if (stored) {
        renderLegacy(stored);
      }
    }

    var cache = readCache();
    var needsFetch = !!araRef && !!endpoint && (!cache || cache.ref !== araRef);

    if (needsFetch) {
      fetchAndCache(araRef, endpoint, renderFromState);
    }
    else {
      renderFromState();
    }

    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        if (activeSource === 'structured' && resourceKey) {
          var current = readCache();
          if (current && current.resources
            && Object.prototype.hasOwnProperty.call(current.resources, resourceKey)) {
            delete current.resources[resourceKey];
            writeCache(current);
          }
        }
        else {
          try {
            localStorage.removeItem(legacyKey);
          }
          catch (e) {
            // Ignore.
          }
        }
        clearReasons();
        banner.classList.add('hidden');
        activeSource = null;
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  }
  else {
    init();
  }
})();
