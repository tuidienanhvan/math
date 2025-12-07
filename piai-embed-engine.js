// piai-embed-engine.js
(function (global) {
  'use strict';

  /**
   * Engine render iframe bằng Blob với hỗ trợ:
   * - Fixed 16:9, scale mobile
   * - Fullscreen (container + postMessage)
   *
   * options:
   * - id:            string  (bắt buộc)
   * - width:         number  (default 800)
   * - height:        number  (default 450)
   * - aspect:        string  (default '16 / 9')
   * - theme:         { red, gold, navy, bg }
   * - htmlGenerator: (isStandalone:boolean, ctx) => string
   *      ctx = { id, width, height, aspect, theme, isIOS, isMobile }
   */
  function render(options) {
    const opts = options || {};
    const ID = opts.id;
    if (!ID) {
      console.error('[PiaiEmbed] options.id is required');
      return;
    }

    const W = typeof opts.width === 'number' ? opts.width : 800;
    const H = typeof opts.height === 'number' ? opts.height : 450;
    const ASPECT = opts.aspect || '16 / 9';

    const T = Object.assign(
      {
        red: '#800020',
        gold: '#b8860b',
        navy: '#002b5c',
        bg: '#f9f7f5',
      },
      opts.theme || {}
    );

    if (typeof opts.htmlGenerator !== 'function') {
      console.error('[PiaiEmbed] options.htmlGenerator must be a function');
      return;
    }

    const container = document.getElementById(ID);
    if (!container) return;

    // Detect Mobile/iOS
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    const isMobile = isIOS || /Mobi|Android/i.test(ua);

    // ============ STYLES & RESPONSIVE (chỉ cho container) ============
    const baseStyle = {
      default: `width:${W}px;max-width:100%;height:${H}px;margin:20px auto;display:flex;justify-content:center;align-items:center;position:relative;border-radius:16px;border:1px solid ${T.red}26;box-shadow:0 10px 30px ${T.navy}26;overflow:hidden;background:${T.bg};aspect-ratio:${ASPECT}`,
      fullscreen: `position:fixed;top:0;left:0;width:100vw;height:100vh;height:100dvh;margin:0;border-radius:0;z-index:99999;background:#000;border:none;box-shadow:none;display:flex;justify-content:center;align-items:center;overflow:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)`,
    };

    if (!document.getElementById(`style-${ID}`)) {
      const style = document.createElement('style');
      style.id = `style-${ID}`;
      style.textContent = `
        @media (max-width: 600px) { 
          #${ID} { 
            width: 100% !important; 
            height: auto !important; 
            aspect-ratio: ${ASPECT}; 
          } 
        }
      `;
      document.head.appendChild(style);
    }

    container.style.cssText = baseStyle.default;

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
      `width:${W}px;height:${H}px;position:relative;` +
      `transform-origin:center;transition:transform .3s ease;flex-shrink:0`;

    // ============ TẠO HTML NỘI DUNG (do file 2 cung cấp) ============
    const ctx = {
      id: ID,
      width: W,
      height: H,
      aspect: ASPECT,
      theme: T,
      isIOS,
      isMobile,
    };

    const html = opts.htmlGenerator(false, ctx);
    const standaloneHTML = opts.htmlGenerator(true, ctx);

    // ============ BLOB / IFRAME SETUP ============
    let iosStandaloneUrl = '';
    if (isIOS && standaloneHTML) {
      try {
        const standaloneBlob = new Blob([standaloneHTML], {
          type: 'text/html',
        });
        iosStandaloneUrl = URL.createObjectURL(standaloneBlob);
      } catch (e) {
        console.error('[PiaiEmbed] standalone Blob error', e);
      }
    }

    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.src = blobUrl;
    iframe.style.cssText =
      'width:100%;height:100%;border:none;border-radius:16px;background:#fff';
    iframe.scrolling = 'no';
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-pointer-lock allow-modals allow-popups'
    );
    iframe.setAttribute('allow', 'fullscreen; clipboard-read; clipboard-write');
    if (iosStandaloneUrl) iframe.dataset.iosStandaloneUrl = iosStandaloneUrl;

    iframe.onload = function () {
      URL.revokeObjectURL(blobUrl);
    };

    // ============ FULLSCREEN & SCALE LOGIC (PARENT) ============
    let isFull = false;
    let resizeRAF = null;

    function updateScale() {
      if (!wrapper || !container) return;

      if (isFull) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let scaleFull = Math.min(vw / W, vh / H);
        if (!Number.isFinite(scaleFull) || scaleFull <= 0) scaleFull = 1;
        wrapper.style.transform = `scale(${scaleFull})`;
        container.style.height = `${vh}px`;
        return;
      }

      if (!isMobile) {
        wrapper.style.transform = 'scale(1)';
        container.style.height = `${H}px`;
        return;
      }

      const rect = container.getBoundingClientRect();
      const availableWidth = rect.width || window.innerWidth;
      const availableHeight = Math.max(
        window.innerHeight - rect.top - 24,
        0
      );

      let scale = availableWidth > 0 ? availableWidth / W : 1;
      if (availableHeight > 0) scale = Math.min(scale, availableHeight / H);

      scale = Math.min(scale, 1);
      if (!Number.isFinite(scale) || scale <= 0) scale = 1;

      wrapper.style.transform = `scale(${scale})`;
      container.style.height = `${H * scale}px`;
    }

    function setFullscreen(state) {
      isFull = state;
      container.style.cssText = state ? baseStyle.fullscreen : baseStyle.default;
      iframe.style.boxShadow = state ? '0 0 60px rgba(0,0,0,.4)' : 'none';
      iframe.style.borderRadius = state ? '0' : '16px';

      updateScale();
      try {
        iframe.contentWindow?.postMessage(
          { type: 'fullscreenState', id: ID, isFullscreen: state },
          '*'
        );
      } catch (e) {}
    }

    function onMessage(e) {
      if (!e.data || e.data.id !== ID) return;
      if (e.data.type === 'toggleFullscreen') {
        if (isIOS) return; // iOS mở tab riêng

        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (isFull) {
          setFullscreen(false);
        } else if (container.requestFullscreen) {
          container
            .requestFullscreen()
            .then(function () {
              setFullscreen(true);
            })
            .catch(function () {
              setFullscreen(true);
            });
        } else {
          setFullscreen(true);
        }
      }
    }

    function onFullscreenChange() {
      if (isIOS) return;
      if (document.fullscreenElement === container) setFullscreen(true);
      else if (isFull && !document.fullscreenElement) setFullscreen(false);
    }

    function onKeydown(e) {
      if (e.key === 'Escape' && isFull && !document.fullscreenElement) {
        setFullscreen(false);
      }
    }

    function onResize() {
      if (resizeRAF) cancelAnimationFrame(resizeRAF);
      resizeRAF = requestAnimationFrame(updateScale);
    }

    window.addEventListener('message', onMessage);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    const observer = new MutationObserver(function (mutations) {
      for (const m of mutations) {
        for (const node of m.removedNodes) {
          if (node === container || (node.contains && node.contains(container))) {
            window.removeEventListener('message', onMessage);
            document.removeEventListener(
              'fullscreenchange',
              onFullscreenChange
            );
            document.removeEventListener('keydown', onKeydown);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('orientationchange', onResize);
            observer.disconnect();
            if (iosStandaloneUrl) {
              try {
                URL.revokeObjectURL(iosStandaloneUrl);
              } catch (e) {}
            }
            return;
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    wrapper.appendChild(iframe);
    container.appendChild(wrapper);
    updateScale();
  }

  global.PiaiEmbed = global.PiaiEmbed || {};
  global.PiaiEmbed.render = render;
})(window);
