/**
 * RP account panel — async balance load + state-based refresh.
 *
 * Triggered when the server-rendered panel marker indicates we should
 * fetch fresh data:
 *   - data-stale="1": rows present but stale → refresh in background
 *   - data-state="no_rows_unknown" | "error": DB has no rows; might still
 *     have an account; ask the API
 *   - .rp-balance-loading: a grant's balance was missing in SSR
 *
 * If none of these conditions hold, the panel was fully rendered SSR and
 * this script does nothing.
 *
 * On API success:
 *   has_account=true → fill .rp-balance text per grant_number
 *   has_account=false → rewrite panel HTML to "GET AN ACCOUNT" CTA
 *   has_account=null → leave skeleton; user retries by refreshing
 *
 * On HTTP failure: console.warn; leave DOM as-is.
 */
(function () {
  'use strict';

  // Retry schedule (ms) for a fetch that fails or returns an unresolved
  // (has_account === null) response. index 0 is the first attempt (immediate);
  // subsequent entries are the backoff delays before each retry. After the
  // last attempt still fails/unresolved, we show a neutral message rather
  // than leaving the "Loading…" skeleton up forever.
  var RETRY_DELAYS = [0, 1000, 2000];

  function init() {
    var panel = document.querySelector('.rp-account-panel');
    if (!panel) {
      return;
    }
    var rpNid = panel.dataset.rpNid;
    if (!rpNid) {
      return;
    }
    var stale = panel.dataset.stale === '1';
    var state = panel.dataset.state || '';
    var loadingBalance = panel.querySelector('.rp-balance-loading') !== null;
    var needsRefresh = stale
      || state === 'no_rows_unknown'
      || state === 'error'
      || loadingBalance;
    if (!needsRefresh) {
      return;
    }

    var url = '/api/1.0/rp-account/' + encodeURIComponent(rpNid);
    if (loadingBalance || stale) {
      url += '?live=1';
    }

    // Attempt the fetch, retrying on HTTP failure or an unresolved
    // (has_account === null) response, up to RETRY_DELAYS.length attempts.
    function attempt(i) {
      fetch(url, {
        credentials: 'same-origin',
        headers: { 'Accept': 'application/json' },
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error('HTTP ' + response.status);
          }
          return response.json();
        })
        .then(function (data) {
          // has_account true/false is a resolved answer — render and stop.
          if (data.has_account === true || data.has_account === false) {
            renderResponse(panel, data);
            return;
          }
          // Unresolved (null): the backend hasn't confirmed yet. Retry if we
          // have attempts left, otherwise show the neutral message.
          retryOrGiveUp(i);
        })
        .catch(function (err) {
          if (window.console && console.warn) {
            console.warn('rp-account refresh failed', err);
          }
          retryOrGiveUp(i);
        });
    }

    function retryOrGiveUp(i) {
      var next = i + 1;
      if (next < RETRY_DELAYS.length) {
        window.setTimeout(function () {
          attempt(next);
        }, RETRY_DELAYS[next]);
      } else {
        renderUnavailable(panel);
      }
    }

    attempt(0);
  }

  /**
   * Replace the loading skeleton with a neutral "unavailable" message so the
   * panel does not hang on "Loading…" when the account data never resolves.
   */
  function renderUnavailable(panel) {
    panel.removeAttribute('data-state');
    panel.removeAttribute('data-stale');
    panel.innerHTML =
      '<p class="text-sm text-white mb-0">Account information is temporarily ' +
      'unavailable. Try again later.</p>';
  }

  function renderResponse(panel, data) {
    if (data.has_account === true) {
      var grants = Array.isArray(data.grants) ? data.grants : [];
      var hasExistingGrants = panel.querySelector('.rp-grant') !== null;

      if (hasExistingGrants) {
        // Server-rendered panel exists — just update balance cells.
        grants.forEach(function (grant) {
          var cell = panel.querySelector(
            '.rp-balance[data-grant="' + cssEscape(grant.grant_number) + '"]'
          );
          if (!cell || grant.project_balance === null || grant.project_balance === undefined || grant.project_balance === '') {
            return;
          }
          cell.textContent = formatBalance(grant);
        });
      } else {
        // No SSR grant rows (e.g. SSR rendered error skeleton). Build the
        // populated panel from JSON. Mirrors the Twig template's structure.
        renderPanelFromJson(panel, data);
      }
    } else if (data.has_account === false) {
      // We confirmed they have no account. Show the account-setup CTA.
      var rpName = (data.rp_display_name || '').toUpperCase();
      var heading =
        '<h3 class="mt-0 text-lg font-bold text-white">GET AN ACCOUNT ON ' +
        escapeHtml(rpName) + '</h3>';
      var setup = data.account_setup;
      if (setup && setup.uri) {
        var setupTitle = setup.title || 'RP Account Setup';
        panel.innerHTML = heading +
          '<a href="' + escapeHtml(setup.uri) +
          '" class="text-white text-sm no-underline hover--underline hover--text-white leading-tight">' +
          escapeHtml(setupTitle) + ' <i class="bi bi-arrow-right"></i></a>';
      } else {
        var manageUrl = data.manage_url || 'https://allocations.access-ci.org/';
        panel.innerHTML = heading +
          '<a href="' + escapeHtml(manageUrl) +
          '" class="text-white text-sm no-underline hover--underline hover--text-white leading-tight">' +
          'Request an account <i class="bi bi-arrow-right"></i></a>';
      }
    }
    // has_account === null is handled by the retry loop in init(), not here.
  }

  /**
   * Escape a value for use inside a CSS attribute selector. Lightweight
   * implementation; handles the characters that grant_numbers can contain.
   */
  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(s);
    }
    return String(s).replace(/(["\\\]\[])/g, '\\$1');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBalance(grant) {
    var formatted = Number(grant.project_balance).toLocaleString(undefined, {
      maximumFractionDigits: 0,
    });
    return 'Balance: ' + formatted + ' ' + (grant.billable_unit || '');
  }

  function renderPanelFromJson(panel, data) {
    var rpName = (data.rp_display_name || '').toUpperCase();
    var manageUrl = data.manage_url || 'https://allocations.access-ci.org/';
    var grants = Array.isArray(data.grants) ? data.grants : [];

    // Drop the data-state attribute so the new content isn't treated as a skeleton.
    panel.removeAttribute('data-state');
    panel.removeAttribute('data-stale');

    var html = '<h3 class="mt-0 text-lg font-bold text-white">YOUR ACCOUNT ON ' +
      escapeHtml(rpName) + '</h3>';

    if (data.rp_username) {
      html += '<p class="text-sm text-white mb-3">Username: <strong class="text-white">' +
        escapeHtml(data.rp_username) + '</strong></p>';
    }

    html += '<div class="rp-account-grants">';
    grants.forEach(function (grant, i) {
      var lastClass = (i === grants.length - 1) ? '' : ' border-b border-md-teal';
      html += '<div class="rp-grant mb-3 pb-3' + lastClass + '">';
      html += '<div class="text-sm font-semibold">' + escapeHtml(grant.grant_number || '') + '</div>';

      if (grant.title) {
        var title = grant.title.length > 50 ? grant.title.substring(0, 50) + '…' : grant.title;
        html += '<div class="text-xs text-light-gray mb-1" title="' + escapeHtml(grant.title) + '">' +
          escapeHtml(title) + '</div>';
      }
      if (grant.project_end) {
        html += '<div class="text-xs">Expires ' + escapeHtml(formatDate(grant.project_end)) + '</div>';
      }
      html += '<div class="text-xs rp-balance" data-grant="' + escapeHtml(grant.grant_number || '') + '">';
      if (grant.project_balance !== null && grant.project_balance !== undefined && grant.project_balance !== '') {
        html += escapeHtml(formatBalance(grant));
      } else {
        html += '<span class="rp-balance-loading">Loading balance…</span>';
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';

    html += '<a href="' + escapeHtml(manageUrl) +
      '" class="text-white text-sm no-underline hover--underline hover--text-white">' +
      'Manage allocations →</a>';

    panel.innerHTML = html;
  }

  function formatDate(iso) {
    // Convert "2026-07-09" → "Jul 9, 2026" to roughly match Twig's date('M j, Y')
    var parts = (iso || '').split('-');
    if (parts.length !== 3) {
      return iso || '';
    }
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var m = parseInt(parts[1], 10) - 1;
    var d = parseInt(parts[2], 10);
    var y = parts[0];
    return (months[m] || parts[1]) + ' ' + d + ', ' + y;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
