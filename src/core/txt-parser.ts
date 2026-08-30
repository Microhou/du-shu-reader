// TXT 文件解析：编码识别与文本规整（纯逻辑，不依赖 DOM / Electron）

/** BOM 优先：UTF-8 / UTF-16；无 BOM 则严格 UTF-8 解码，失败回退 GB18030（GBK 系超集） */
export function decodeTxt(buffer: ArrayBuffer | Uint8Array): string {
  const bytes =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

/** 规整换行：CRLF/CR → LF；压缩 4 个以上连续换行；去首尾空白 */
export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function titleFromFilename(filename: string | null | undefined): string {
  const name = (filename ?? '').replace(/\.txt$/i, '').trim();
  return name || '未命名';
}

export interface ParsedTxt {
  title: string;
  content: string;
}

export function parseTxt(
  buffer: ArrayBuffer | Uint8Array,
  filename?: string | null,
): ParsedTxt {
  return {
    title: titleFromFilename(filename),
    content: normalizeText(decodeTxt(buffer)),
  };
}
