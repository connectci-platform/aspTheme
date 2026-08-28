/**
 * @file
 * Client-side name filter for the SDS software table.
 *
 * The table is server-rendered in full and scrolls inside a fixed-height box,
 * so with JS off every row is readable and the filter input never appears.
 * Rows are hidden with the `hidden` attribute rather than a class so they
 * leave the accessibility tree too.
 *
 * Matching is on the Application name only. To widen it, build the cached
 * string from row.textContent instead of row.cells[0].
 */
((Drupal, once) => {
  'use strict';

  /**
   * Wire up one .rp-sds-software wrapper.
   *
   * @param {HTMLElement} wrapper
   *   The software table wrapper.
   */
  function initFilter(wrapper) {
    const rows = Array.from(wrapper.querySelectorAll('tbody > tr'));
    const input = wrapper.querySelector('.rp-sds-software__filter');
    const filterWrap = wrapper.querySelector('.rp-sds-software__filter-wrap');
    const empty = wrapper.querySelector('.rp-sds-software__empty');
    const status = wrapper.querySelector('[role="status"]');
    if (!rows.length || !input || !filterWrap) {
      return;
    }

    // Cache the lowercased Application cell text once; filtering then never
    // touches the DOM for anything but the hidden toggle.
    const names = rows.map((row) =>
      (row.cells[0] ? row.cells[0].textContent : '').trim().toLowerCase(),
    );
    const total = rows.length;

    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      let shown = 0;
      // 1100 boolean toggles is sub-millisecond, so no debounce is needed.
      rows.forEach((row, i) => {
        const match = query === '' || names[i].indexOf(query) !== -1;
        row.hidden = !match;
        if (match) {
          shown++;
        }
      });

      if (empty) {
        empty.hidden = shown !== 0;
      }
      if (status) {
        status.textContent =
          query === ''
            ? ''
            : Drupal.t('Showing @count of @total software packages', {
                '@count': shown,
                '@total': total,
              });
      }
    });

    // Only reveal the input once it works, so no-JS visitors never see a
    // dead control.
    filterWrap.hidden = false;
  }

  Drupal.behaviors.rpSoftwareFilter = {
    attach(context) {
      once('rp-software-filter', '.rp-sds-software', context).forEach(
        initFilter,
      );
    },
  };
})(Drupal, once);
