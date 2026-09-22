/**
 * ARA recommendation banner on the resource documentation page.
 *
 * The ACCESS Resource Advisor (ARA) links here with two query parameters:
 *
 *   ?ara_context=<plain text>&ara_data=<base64url JSON>
 *
 * `ara_data` is base64url (padding optional) of one JSON object describing
 * this resource's recommendation:
 *
 *   {
 *     "global_resource_id": "delta-gpu.ncsa.access-ci.org",
 *     "reasons": ["NVIDIA H200 141 GB", "GPU"],
 *     "rp_docs_description": "<banner body>",
 *     ...
 *   }
 *
 * The payload is only used when its global_resource_id equals this node's
 * field_access_global_resource_id (drupalSettings.aspTheme.ara
 * .globalResourceId, set in aspTheme.theme). The banner body is
 * rp_docs_description, else description, else ara_context; reasons render
 * as a plain list under it. `blurb`, `score` and `tooltip` are ignored.
 *
 * Anything wrong with ara_data (missing, bad base64, bad JSON, wrong shape,
 * a different resource) falls through silently to the ara_context-only
 * banner, which behaves exactly as it did before ara_data existed.
 *
 * Every payload value reaches the DOM through textContent/createTextNode
 * only, so HTML in a payload renders as literal text.
 *
 * Persistence, per node, so the banner survives a reload and Dismiss sticks:
 *   ara_recommendation_{nid}  the ara_context string (unchanged key)
 *   ara_data_{nid}            the sanitized ara_data object
 * A visit carrying either parameter replaces both; a visit with neither
 * renders from storage.
 */
(function () {
  'use strict';

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    }
    catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    }
    catch (e) {
      // Ignore; the banner still renders for this pageview.
    }
  }

  function storageRemove(key) {
    try {
      localStorage.removeItem(key);
    }
    catch (e) {
      // Ignore.
    }
  }

  /**
   * Decodes base64url (with or without padding) to a UTF-8 string, or
   * returns null.
   */
  function decodeBase64Url(input) {
    if (typeof input !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(input)) {
      return null;
    }
    var b64 = input.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
    if (b64.length % 4 === 1) {
      return null;
    }
    while (b64.length % 4) {
      b64 += '=';
    }
    try {
      var binary = atob(b64);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch (e) {
      return null;
    }
  }

  /**
   * Reduces a decoded payload to the fields the banner uses, or returns null
   * if it isn't for this resource or has nothing to show.
   */
  function sanitizeAraData(data, globalResourceId) {
    if (!isPlainObject(data) || !globalResourceId
      || data.global_resource_id !== globalResourceId) {
      return null;
    }
    var clean = {
      global_resource_id: data.global_resource_id,
      reasons: Array.isArray(data.reasons)
        ? data.reasons.filter(function (reason) {
          return typeof reason === 'string' && reason.trim() !== '';
        })
        : [],
    };
    ['rp_docs_description', 'description'].forEach(function (key) {
      if (typeof data[key] === 'string' && data[key].trim() !== '') {
        clean[key] = data[key];
      }
    });
    return clean;
  }

  function parseAraData(encoded, globalResourceId) {
    var json = decodeBase64Url(encoded);
    if (json === null) {
      return null;
    }
    try {
      return sanitizeAraData(JSON.parse(json), globalResourceId);
    }
    catch (e) {
      return null;
    }
  }

  function init() {
    var banner = document.getElementById('ara-recommendation-banner');
    if (!banner) {
      return;
    }
    var textEl = document.getElementById('ara-recommendation-text');
    var dismissBtn = document.getElementById('ara-dismiss');
    var nodeId = banner.getAttribute('data-node-id') || '';
    var contextKey = 'ara_recommendation_' + nodeId;
    var dataKey = 'ara_data_' + nodeId;

    var settings = (window.drupalSettings
      && drupalSettings.aspTheme
      && drupalSettings.aspTheme.ara) || {};
    var globalResourceId = typeof settings.globalResourceId === 'string'
      ? settings.globalResourceId
      : '';

    var params = new URLSearchParams(window.location.search);
    var context = params.get('ara_context');
    var encoded = params.get('ara_data');
    var araData = null;

    if (context !== null || encoded !== null) {
      araData = encoded ? parseAraData(encoded, globalResourceId) : null;
      if (context) {
        storageSet(contextKey, context);
      }
      else {
        storageRemove(contextKey);
        context = null;
      }
      if (araData) {
        storageSet(dataKey, JSON.stringify(araData));
      }
      else {
        storageRemove(dataKey);
      }
    }
    else {
      context = storageGet(contextKey);
      var stored = storageGet(dataKey);
      if (stored) {
        try {
          araData = sanitizeAraData(JSON.parse(stored), globalResourceId);
        }
        catch (e) {
          araData = null;
        }
      }
    }

    var body = (araData && (araData.rp_docs_description || araData.description))
      || context
      || '';
    var reasons = araData ? araData.reasons : [];

    if (!body && !reasons.length) {
      return;
    }

    textEl.textContent = body;

    if (reasons.length) {
      var list = document.createElement('ul');
      list.id = 'ara-recommendation-reasons';
      list.className = 'list-disc ml-5 mt-2 text-sm';
      reasons.forEach(function (reason) {
        var item = document.createElement('li');
        item.textContent = reason;
        list.appendChild(item);
      });
      // Above Dismiss, so the reasons read as part of the banner body.
      if (dismissBtn && dismissBtn.parentNode === banner) {
        banner.insertBefore(list, dismissBtn);
      }
      else {
        banner.appendChild(list);
      }
    }

    banner.classList.remove('hidden');

    if (dismissBtn) {
      dismissBtn.addEventListener('click', function () {
        storageRemove(contextKey);
        storageRemove(dataKey);
        banner.classList.add('hidden');
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
