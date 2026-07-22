;(function () {
  'use strict';

  // Returns the responsive item count given a base (desktop) count:
  // 1 item on mobile (<=550px), 2 on tablet (<=900px), and the base count
  // on larger screens, regardless of base.
  function responsiveCount(base) {
    var w = window.innerWidth;
    if (w <= 550) return 1;
    if (w <= 900) return 2;
    return base;
  }

  function buildCarousel(el, itemsPerSlide, interval) {
    const inner = el.querySelector('.carousel-inner');
    // Use only the original (non-clone) items stored on the element.
    const items = el._carouselItems;
    const total = items.length;
    let timer = null;
    let visibilityHandler = null;

    // Set every width property together. Setting only min-width lets Safari
    // keep honoring any CSS max-width/flex-basis cap, which breaks the
    // responsive breakpoints; pinning flex/width/min/max removes ambiguity.
    function setItemWidth(item, pct) {
      const w = pct + '%';
      item.style.flex = '0 0 ' + w;
      item.style.width = w;
      item.style.minWidth = w;
      item.style.maxWidth = w;
    }

    if (total <= itemsPerSlide) {
      // Show all items with equal width, no sliding needed.
      items.forEach(function (item) {
        setItemWidth(item, 100 / total);
      });
      inner.style.transform = '';
      inner.style.transition = 'none';
      return { destroy: function () {} };
    }

    // Clone first itemsPerSlide items and append so wrap-around looks seamless.
    items.slice(0, itemsPerSlide).forEach(function (item) {
      inner.appendChild(item.cloneNode(true));
    });

    const itemWidth = 100 / itemsPerSlide;
    inner.querySelectorAll('.carousel-item').forEach(function (item) {
      setItemWidth(item, itemWidth);
    });

    let current = 0;

    function goTo(idx, animate) {
      if (animate === false) {
        inner.style.transition = 'none';
      } else {
        inner.style.transition = '';
      }
      current = idx;
      inner.style.transform = 'translateX(-' + (current * itemWidth) + '%)';
    }

    function onTransitionEnd() {
      if (current >= total) goTo(current - total, false);
      if (current < 0) goTo(current + total, false);
    }
    inner.addEventListener('transitionend', onTransitionEnd);

    function startAuto() {
      timer = setInterval(function () { goTo(current + 1, true); }, interval);
    }
    function stopAuto() { clearInterval(timer); timer = null; }
    function resetAuto() { stopAuto(); startAuto(); }

    visibilityHandler = function () {
      if (document.hidden) {
        stopAuto();
      } else {
        inner.style.transition = 'none';
        if (current >= total) current = current - total;
        if (current < 0) current = current + total;
        inner.style.transform = 'translateX(-' + (current * itemWidth) + '%)';
        startAuto();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    el.querySelector('[data-slide="prev"]')?.addEventListener('click', function (e) {
      e.preventDefault();
      goTo(current - 1, true);
      resetAuto();
    });

    el.querySelector('[data-slide="next"]')?.addEventListener('click', function (e) {
      e.preventDefault();
      goTo(current + 1, true);
      resetAuto();
    });

    goTo(0, false);
    startAuto();

    return {
      destroy: function () {
        stopAuto();
        if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);
        inner.removeEventListener('transitionend', onTransitionEnd);
        // Remove clones (everything after the original items).
        Array.from(inner.querySelectorAll('.carousel-item')).slice(total).forEach(function (clone) {
          clone.parentNode.removeChild(clone);
        });
        inner.style.transform = '';
        inner.style.transition = 'none';
      }
    };
  }

  function initCarousel(el, baseItems, interval) {
    // Store originals once so rebuilds always work from clean state.
    el._carouselItems = Array.from(el.querySelectorAll('.carousel-item'));

    var currentCount = responsiveCount(baseItems);
    var instance = buildCarousel(el, currentCount, interval);

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var newCount = responsiveCount(baseItems);
        if (newCount !== currentCount) {
          instance.destroy();
          currentCount = newCount;
          instance = buildCarousel(el, currentCount, interval);
        }
      }, 150);
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') {
      fn();
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  ready(function () {
    var projectSlider = document.querySelector('#projectSlider');
    if (projectSlider) initCarousel(projectSlider, 3, 5000);

    var studentSlider = document.querySelector('#studentSlider');
    if (studentSlider) initCarousel(studentSlider, 5, 5000);

    var mentorSlider = document.querySelector('#mentorSlider');
    if (mentorSlider) initCarousel(mentorSlider, 3, 5000);

    var researcherSlider = document.querySelector('#researcherSlider');
    if (researcherSlider) initCarousel(researcherSlider, 3, 5000);
  });
})();
