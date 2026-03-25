/** Minimal markdown to HTML: headings, bold, italic, links, lists, blockquotes, paragraphs */
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(https?:\/\/[^\s<]+)/g, (match, url) => {
      if (text.indexOf(`href="${url}"`) !== -1) return match;
      return `<a href="${url}" target="_blank" rel="noopener">${url}</a>`;
    });
}

export function renderMarkdown(md: string): string {
  return md
    .split('\n\n')
    .map(block => {
      block = block.trim();
      if (!block) return '';
      if (block.startsWith('## ')) return `<h3>${inlineFormat(block.slice(3))}</h3>`;
      if (block.startsWith('### ')) return `<h4>${inlineFormat(block.slice(4))}</h4>`;
      if (block.startsWith('> ')) {
        const text = block.replace(/^> /gm, '');
        return `<blockquote>${inlineFormat(text)}</blockquote>`;
      }
      const lines = block.split('\n');
      if (lines.every(l => l.match(/^\s*-\s/))) {
        const items = lines.map(l => `<li>${inlineFormat(l.replace(/^\s*-\s+/, ''))}</li>`).join('');
        return `<ul>${items}</ul>`;
      }
      if (lines.every(l => l.match(/^\s*\d+\.\s/))) {
        const items = lines.map(l => `<li>${inlineFormat(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('');
        return `<ol>${items}</ol>`;
      }
      // Preserve single newlines within a paragraph block
      return `<p>${inlineFormat(block.replace(/\n/g, '<br/>'))}</p>`;
    })
    .join('');
}
