/**
 * @file
 * More/Less toggle plus a pager for the SDS software table.
 *
 * The table is server-rendered in full, so with JS off every row is readable.
 * On attach we collapse to the first few rows; "More" opens the current page
 * and reveals the pager. Rows are hidden with the `hidden` attribute rather
 * than a class so they leave the accessibility tree too.
 *
 * Page size and initial row count come from data attributes on the wrapper so
 * they stay in sync with whatever the Twig template rendered.
 */
((Drupal, once) => {
  'use strict';

  /**
   * Wire up one .rp-sds-software wrapper.
   *
   * @param {HTMLElement} wrapper
   *   The software table wrapper.
   */
  function initPager(wrapper) {
    const rows = Array.from(wrapper.querySelectorAll('tbody > tr'));
    const moreButton = wrapper.querySelector('.rp-sds-software__more');
    const pager = wrapper.querySelector('.rp-sds-software__pager');
    const status = wrapper.querySelector('[role="status"]');
    if (!rows.length || !moreButton) {
      return;
    }

    const pageSize = parseInt(wrapper.dataset.pageSize, 10) || 25;
    const initialRows = parseInt(wrapper.dataset.initialRows, 10) || 5;
    const pageCount = Math.ceil(rows.length / pageSize);
    // A list that fits on one page needs no pager, and "More" reveals all of it.
    const singlePage = pageCount <= 1;

    let currentPage = 1;
    let expanded = false;
    // Once revealed, the pager stays on screen through a "Less" collapse so
    // the retained page number remains visible.
    let pagerRevealed = false;

    /**
     * Show only the rows in [start, end) of the full row list.
     */
    function showRange(start, end) {
      rows.forEach((row, index) => {
        row.hidden = index < start || index >= end;
      });
    }

    /**
     * Announce what is on screen to screen readers.
     */
    function announce(start, shown) {
      if (!status) {
        return;
      }
      status.textContent = expanded
        ? Drupal.t('Showing rows @first–@last of @total', {
          '@first': start + 1,
          '@last': start + shown,
          '@total': rows.length,
        })
        : Drupal.t('Showing @shown of @total rows on page @page', {
          '@shown': shown,
          '@total': Math.min(pageSize, rows.length - start),
          '@page': currentPage,
        });
    }

    /**
     * Re-render rows, button label and pager state for the current page.
     */
    function render() {
      const start = (currentPage - 1) * pageSize;
      const pageEnd = Math.min(start + pageSize, rows.length);
      const end = expanded ? pageEnd : Math.min(start + initialRows, pageEnd);

      showRange(start, end);
      moreButton.textContent = expanded ? Drupal.t('Less') : Drupal.t('More');
      moreButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');

      if (pager && !singlePage) {
        pager.hidden = !pagerRevealed;
        pager.querySelectorAll('button[data-page]').forEach((button) => {
          const isCurrent = parseInt(button.dataset.page, 10) === currentPage;
          if (isCurrent) {
            button.setAttribute('aria-current', 'page');
          }
          else {
            button.removeAttribute('aria-current');
          }
        });
      }

      announce(start, end - start);
    }

    moreButton.addEventListener('click', () => {
      expanded = !expanded;
      if (expanded) {
        pagerRevealed = true;
      }
      render();
    });

    if (pager) {
      pager.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-page]');
        if (!button) {
          return;
        }
        currentPage = parseInt(button.dataset.page, 10) || 1;
        // Paging is an explicit request to see that page, so it expands.
        expanded = true;
        pagerRevealed = true;
        render();
      });
    }

    render();
  }

  Drupal.behaviors.rpSoftwarePager = {
    attach(context) {
      once('rp-software-pager', '.rp-sds-software', context).forEach(initPager);
    },
  };
})(Drupal, once);
