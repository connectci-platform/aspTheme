/**
 * Collapse/expand the third level of the Access Documentation sidebar menu.
 *
 * The level-2 link still navigates; only the chevron button toggles the
 * .doc-menu-open class on its <li>, which the CSS uses to show/hide the
 * third-level <ul> and rotate the chevron. Kept deliberately separate from the
 * theme's global details.js accordion (which expects <details>/<div>).
 */
(function (Drupal) {
  'use strict';

  Drupal.behaviors.docMenuToggle = {
    attach: function (context) {
      var toggles = context.querySelectorAll(
        '#block-asptheme-accessdocumentation .doc-menu-toggle'
      );
      toggles.forEach(function (btn) {
        if (btn.dataset.docMenuBound) {
          return;
        }
        btn.dataset.docMenuBound = '1';
        btn.addEventListener('click', function () {
          var li = btn.closest('.menu-item--collapsible');
          if (!li) {
            return;
          }
          var open = li.classList.toggle('doc-menu-open');
          btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      });
    }
  };
})(Drupal);
