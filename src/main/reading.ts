// Extract text only. Remote markup, links, images and form fields never enter browser chrome.
export const readingScript = `(() => {
  const roots = [...document.querySelectorAll('article, main, [role="main"]')];
  const score = node => [...node.querySelectorAll('p')].reduce((sum, p) => sum + (p.textContent || '').length, 0);
  const root = roots.sort((a, b) => score(b) - score(a))[0] || document.body;
  if (!root) return { title: document.title.slice(0, 500), blocks: [] };
  const blocks = [], seen = new Set();
  let length = 0;
  for (const node of root.querySelectorAll('h2,h3,p,blockquote,li')) {
    if (node.closest('nav,header,footer,aside,form,button,[aria-hidden="true"]') || !node.getClientRects().length) continue;
    if (node.matches('li,blockquote') && node.querySelector('p')) continue;
    const text = (node.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 3000);
    if (!text || seen.has(text)) continue;
    seen.add(text); length += text.length;
    blocks.push({ kind: /^H/.test(node.tagName) ? 'heading' : node.tagName === 'BLOCKQUOTE' ? 'quote' : 'paragraph', text });
    if (blocks.length >= 200 || length >= 100000) break;
  }
  return { title: (root.querySelector('h1')?.textContent || document.title).trim().slice(0, 500), blocks };
})()`;
