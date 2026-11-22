// @ts-check
(() => {
  'use strict';

  /** @param {string} id */
  const cloneTemplate = (id) => {
    const template = document.getElementById(id);
    if (!(template instanceof HTMLTemplateElement)) return null;
    const copy = template.content.firstElementChild?.cloneNode(true);
    return copy instanceof Element ? copy : null;
  };

  const initThemeToggle = () => {
    const root = document.documentElement;
    for (const toggle of document.querySelectorAll('.theme-toggle')) {
      toggle.addEventListener('click', () => {
        const chosen = root.getAttribute('data-theme');
        const dark = chosen ? chosen === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
        const next = dark ? 'light' : 'dark';
        root.setAttribute('data-theme', next);
        try {
          localStorage.setItem('theme', next);
        } catch { }
      });
    }
  };

  const initCodeBlocks = () => {
    // Jekyll produces different HTML depending on how a code block is written.
    // When md blocks are used, the code is inside a div with the highlighter-rouge
    // class. When the highlight tag is used, the code is inside a figure element,
    // and when linenos are used it goes inside a table, in the td.code cell.
    for (const block of document.querySelectorAll('.post-content div.highlighter-rouge, .post-content figure.highlight')) {
      const code = block.querySelector('td.code pre') ?? block.querySelector('pre');
      const head = cloneTemplate('tpl-code-head');
      if (!code || !head) continue;

      let language = block.querySelector('code[data-lang]')?.getAttribute('data-lang') || '';
      if (!language) {
        const prefix = 'language-';
        const languageClass = [...block.classList].find((name) => name.startsWith(prefix));
        language = languageClass?.slice(prefix.length) ?? '';
      }
      const label = head.querySelector('.code-lang');
      if (label) label.textContent = language === 'plaintext' ? 'text' : language;

      const button = head.querySelector('button');
      if (button && navigator.clipboard) {
        const idle = button.textContent;
        let timer = 0;
        button.addEventListener('click', async () => {
          let copied = false;
          try {
            await navigator.clipboard.writeText((code.textContent ?? '').trimEnd());
            copied = true;
          } catch {}
          button.textContent = copied ? 'copied' : 'failed';
          button.classList.toggle('copied', copied);
          clearTimeout(timer);
          timer = window.setTimeout(() => {
            button.textContent = idle;
            button.classList.remove('copied');
          }, 1500);
        });
      } else {
        button?.remove();
      }

      block.prepend(head);
    }
  };

  const initTables = () => {
    for (const table of document.querySelectorAll('.post-content > table')) {
      const box = document.createElement('div');
      box.className = 'table-wrap';
      table.before(box);
      box.append(table);
    }
  };

  const initHeadingLinks = () => {
    for (const heading of document.querySelectorAll('.post-content h2[id], .post-content h3[id]')) {
      const link = cloneTemplate('tpl-anchor');
      if (!link) return;
      link.setAttribute('href', `#${heading.id}`);
      heading.append(link);
    }
  };

  const initToc = () => {
    const toc = document.getElementById('toc');
    const article = document.querySelector('.post-content');
    const details = toc?.querySelector('details');
    if (!toc || !article || !details) return;

    const wide = window.matchMedia('(min-width: 961px)');
    const syncOpen = () => {
      details.open = wide.matches;
    };
    syncOpen();
    wide.addEventListener('change', syncOpen);
    toc.addEventListener('click', (event) => {
      if (!wide.matches && event.target instanceof HTMLAnchorElement) details.open = false;
    });

    const sections = Array.from(toc.querySelectorAll('a')).flatMap((link) => {
      const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
      return heading ? [{ link, heading }] : [];
    });
    const progress = document.getElementById('toc-progress');

    const update = () => {
      const passed = sections.filter(({ heading }) => heading.getBoundingClientRect().top <= 110);
      const current = passed[passed.length - 1]?.link ?? null;
      const previous = toc.querySelector('a.active');
      if (current !== previous) {
        previous?.classList.remove('active');
        current?.classList.add('active');
        if (current && (current.offsetTop < toc.scrollTop || current.offsetTop > toc.scrollTop + toc.clientHeight - 40)) {
          toc.scrollTop = current.offsetTop - toc.clientHeight / 2;
        }
      }

      if (progress) {
        const { top, height } = article.getBoundingClientRect();
        const ratio = -top / Math.max(1, height - window.innerHeight);
        progress.textContent = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}% read`;
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  };

  const initFilter = () => {
    const box = document.getElementById('filter');
    const input = document.getElementById('filter-input');
    if (!box || !(input instanceof HTMLInputElement)) return;
    box.hidden = false;

    const apply = () => {
      const terms = input.value.toLowerCase().split(/\s+/).filter(Boolean);
      for (const row of document.querySelectorAll('.post-row')) {
        const text = row.getAttribute('data-text') ?? '';
        row.toggleAttribute('hidden', !terms.every((term) => text.includes(term)));
      }
      for (const group of document.querySelectorAll('.year-group')) {
        group.toggleAttribute('hidden', !group.querySelector('.post-row:not([hidden])'));
      }
      const anyShown = document.querySelector('.post-row:not([hidden])') !== null;
      document.getElementById('filter-empty')?.toggleAttribute('hidden', anyShown);
    };
    input.addEventListener('input', apply);

    document.addEventListener('keydown', (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea'));
      if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        input.focus();
      } else if (event.key === 'Escape' && target === input) {
        input.value = '';
        apply();
        input.blur();
      }
    });
  };

  initThemeToggle();
  initCodeBlocks();
  initTables();
  initHeadingLinks();
  initToc();
  initFilter();
})();
