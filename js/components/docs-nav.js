/**
 * Documentation TOC Navigation & Scroll-Spy Controller
 */

export function initDocsNav() {
  const scrollPane = document.getElementById('docsBodyPane');
  if (!scrollPane) return;

  // KaTeX 数式自動レンダリング
  function renderMath() {
    if (window.renderMathInElement) {
      window.renderMathInElement(scrollPane, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false
      });
    }
  }

  // 初期ロード時 & タブ切り替え時に実行
  renderMath();
  document.getElementById('navGuideBtn')?.addEventListener('click', () => {
    setTimeout(renderMath, 50);
  });


  const tocLinks = document.querySelectorAll('.docs-toc-scroll .toc-link');
  if (!tocLinks.length) return;

  // 1. スムーズスクロール クリックハンドラー
  tocLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (!targetId || !targetId.startsWith('#')) return;
      e.preventDefault();

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        // scrollPane 内での相対位置を計算
        const paneRect = scrollPane.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();
        const targetTop = scrollPane.scrollTop + (targetRect.top - paneRect.top) - 16;

        scrollPane.scrollTo({
          top: targetTop,
          behavior: 'smooth'
        });

        // クリックしたリンクを即座にアクティブ表示
        tocLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        const parentGroup = link.closest('.toc-group');
        if (parentGroup) {
          const chLink = parentGroup.querySelector('.toc-ch-link');
          if (chLink) chLink.classList.add('active');
        }
      }
    });
  });

  // 2. スクロールスパイ (IntersectionObserver または scroll イベント)
  const sections = Array.from(document.querySelectorAll('.docs-chapter, .docs-section[id]'));
  if (!sections.length) return;

  let isTicking = false;
  scrollPane.addEventListener('scroll', () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        updateActiveToc();
        isTicking = false;
      });
      isTicking = true;
    }
  }, { passive: true });

  function updateActiveToc() {
    const paneRect = scrollPane.getBoundingClientRect();
    const probeY = paneRect.top + 80; // 視線に近い上部位置で判定

    let currentSection = null;
    for (const sec of sections) {
      const r = sec.getBoundingClientRect();
      if (r.top <= probeY) {
        currentSection = sec;
      } else {
        break;
      }
    }

    if (currentSection) {
      const currentId = `#${currentSection.id}`;
      let activeLink = document.querySelector(`.docs-toc-scroll a[href="${currentId}"]`);
      if (!activeLink) {
        // サブセクションが属する親チャプターを取得
        const parentCh = currentSection.closest('.docs-chapter');
        if (parentCh) {
          activeLink = document.querySelector(`.docs-toc-scroll a[href="#${parentCh.id}"]`);
        }
      }

      if (activeLink) {
        tocLinks.forEach(l => l.classList.remove('active'));
        activeLink.classList.add('active');

        // 親チャプターリンクもハイライト
        const parentGroup = activeLink.closest('.toc-group');
        if (parentGroup) {
          const chLink = parentGroup.querySelector('.toc-ch-link');
          if (chLink) chLink.classList.add('active');
        }
      }
    }
  }
}
