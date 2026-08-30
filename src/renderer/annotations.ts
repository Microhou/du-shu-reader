// EPUB 内联划线的 DOM 工具：文本偏移换算与 mark 合成/清除。
// 锚定方式：章节纯文本（textContent）内的 [start, end) 字符区间——
// 不受排版/字号影响，且 mark 元素不改变 textContent，偏移保持稳定。

export interface MarkAnchor {
  id: string;
  start: number;
  end: number;
  note?: string;
}

/** 节点在 root 纯文本中的字符偏移；找不到时返回 null */
export function getTextOffset(
  root: Element,
  node: Node,
  offset: number,
): number | null {
  if (node === root) return offset === 0 ? 0 : null;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let acc = 0;
  for (let cur = walker.nextNode(); cur; cur = walker.nextNode()) {
    if (cur === node) return acc + offset;
    acc += (cur as Text).data.length;
  }
  return null;
}

/** 从 node 向上找带指定属性的祖先元素（含 root 边界） */
export function findAncestorWithAttr(
  node: Node | null,
  root: Element | null,
  attr: string,
): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== root) {
    if (cur instanceof HTMLElement && cur.hasAttribute(attr)) return cur;
    cur = cur.parentNode;
  }
  return null;
}

/** 清除 root 内既有的内联划线（展开回纯文本并合并相邻节点） */
export function removeMarks(root: HTMLElement): void {
  for (const mark of [...root.querySelectorAll('mark[data-ann-id]')]) {
    const parent = mark.parentNode;
    if (!parent) continue;
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
    mark.remove();
    parent.normalize();
  }
}

/**
 * 把标注区间合成为内联 <mark data-ann-id>。
 * 从右往左应用，避免左侧区间因 splitText 导致节点映射失效。
 */
export function applyMarks(
  root: HTMLElement,
  marks: MarkAnchor[],
): void {
  removeMarks(root);
  const ordered = [...marks]
    .filter((m) => m.end > m.start)
    .sort((a, b) => b.start - a.start);
  for (const mark of ordered) {
    const nodes: { text: Text; start: number; end: number }[] = [];
    let acc = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n as Text;
      nodes.push({ text: t, start: acc, end: acc + t.data.length });
      acc += t.data.length;
    }
    for (const { text: t, start: ns } of nodes) {
      if (ns >= mark.end || ns + t.data.length <= mark.start) continue;
      const localStart = Math.max(0, mark.start - ns);
      const localEnd = Math.min(t.data.length, mark.end - ns);
      if (localEnd <= localStart) continue;
      let target = t;
      if (localStart > 0) target = t.splitText(localStart);
      if (localEnd - localStart < target.data.length) {
        target.splitText(localEnd - localStart);
      }
      const markEl = document.createElement('mark');
      markEl.setAttribute('data-ann-id', mark.id);
      markEl.className = mark.note ? 'mark mark-note' : 'mark mark-hl';
      if (mark.note) markEl.title = mark.note;
      target.parentNode?.insertBefore(markEl, target);
      markEl.appendChild(target);
    }
  }
}
