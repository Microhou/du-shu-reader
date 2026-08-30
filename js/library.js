// 书库逻辑：存储介质可注入，便于单元测试
// storage 接口：{ get(key), set(key, value), del(key) }，均为 Promise

export function createLibrary(storage) {
  const LIST_KEY = 'library';

  async function loadList() {
    return (await storage.get(LIST_KEY)) ?? [];
  }

  async function saveList(list) {
    await storage.set(LIST_KEY, list);
  }

  return {
    async listBooks() {
      return loadList();
    },

    async addBook(title, content) {
      const list = await loadList();
      const book = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        addedAt: Date.now(),
        lastReadAt: 0,
        progress: 0,
      };
      list.unshift(book);
      await storage.set(`book:${book.id}`, content);
      await saveList(list);
      return book;
    },

    async getBookContent(id) {
      return (await storage.get(`book:${id}`)) ?? null;
    },

    async saveProgress(id, ratio) {
      const list = await loadList();
      const book = list.find((b) => b.id === id);
      if (!book) return null;
      book.progress = Math.min(1, Math.max(0, ratio));
      book.lastReadAt = Date.now();
      await saveList(list);
      return book;
    },

    async removeBook(id) {
      const list = await loadList();
      const next = list.filter((b) => b.id !== id);
      await storage.del(`book:${id}`);
      await saveList(next);
      return next.length !== list.length;
    },
  };
}

export function formatProgress(ratio) {
  if (!ratio || ratio <= 0) return '未读';
  return `${Math.floor(ratio * 100)}%`;
}

export function formatTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
