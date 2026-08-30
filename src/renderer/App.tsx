import { useCallback, useEffect, useState } from 'react';

import { parseTxt, titleFromFilename } from '../core/txt-parser.ts';
import { parseEpub } from '../core/epub-parser.ts';
import type {
  BookFormat,
  BookMeta,
  OpenedTextFile,
} from '../shared/types.ts';
import Bookshelf from './components/Bookshelf.tsx';
import Reader from './components/Reader.tsx';
import { library } from './library.ts';

type View = { name: 'shelf' } | { name: 'reader'; bookId: string };

export interface ImportResult {
  added: number;
  failed: number;
}

function detectFormat(name: string): BookFormat | null {
  if (/\.txt$/i.test(name)) return 'txt';
  if (/\.epub$/i.test(name)) return 'epub';
  if (/\.pdf$/i.test(name)) return 'pdf';
  return null;
}

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
    async (files: OpenedTextFile[]): Promise<ImportResult> => {
      let added = 0;
      let failed = 0;
      for (const file of files) {
        try {
          const format = detectFormat(file.name);
          if (!format) {
            failed += 1;
            continue;
          }
          if (format === 'txt') {
            const { title, content } = parseTxt(file.data, file.name);
            if (!content) {
              failed += 1;
              continue;
            }
            await library.addBook(title, 'txt', { kind: 'txt', text: content });
          } else if (format === 'epub') {
            const book = await parseEpub(file.data);
            await library.addBook(titleFromFilename(file.name), 'epub', {
              kind: 'epub',
              book,
            });
          } else {
            await library.addBook(titleFromFilename(file.name), 'pdf', {
              kind: 'pdf',
              data: file.data,
            });
          }
          added += 1;
        } catch {
          failed += 1;
        }
      }
      if (added > 0) await refresh();
      return { added, failed };
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
