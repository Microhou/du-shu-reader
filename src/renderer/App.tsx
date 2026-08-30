import { useCallback, useEffect, useState } from 'react';

import { parseTxt } from '../core/txt-parser.ts';
import type { BookMeta, OpenedTextFile } from '../shared/types.ts';
import Bookshelf from './components/Bookshelf.tsx';
import Reader from './components/Reader.tsx';
import { library } from './library.ts';

type View = { name: 'shelf' } | { name: 'reader'; bookId: string };

export default function App() {
  const [view, setView] = useState<View>({ name: 'shelf' });
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setBooks(await library.listBooks());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const importFiles = useCallback(
    async (files: OpenedTextFile[]) => {
      let added = 0;
      for (const file of files) {
        const { title, content } = parseTxt(file.data, file.name);
        if (!content) continue;
        await library.addBook(title, content);
        added += 1;
      }
      if (added > 0) await refresh();
      return added;
    },
    [refresh],
  );

  const removeBook = useCallback(
    async (id: string) => {
      await library.removeBook(id);
      await refresh();
    },
    [refresh],
  );

  if (view.name === 'reader') {
    return (
      <Reader
        bookId={view.bookId}
        onBack={() => {
          void refresh();
          setView({ name: 'shelf' });
        }}
      />
    );
  }

  return (
    <Bookshelf
      books={books}
      loaded={loaded}
      onOpen={(id) => setView({ name: 'reader', bookId: id })}
      onImport={importFiles}
      onRemove={(id) => void removeBook(id)}
    />
  );
}
