// TXT 文件解析：编码识别与文本规整

export function decodeTxt(buffer) {
  const bytes = new Uint8Array(buffer);
  // BOM 优先：UTF-8 / UTF-16
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  // 严格 UTF-8 解码失败则回退 GB18030（网上大量中文 TXT 为 GBK 系编码）
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('gb18030').decode(bytes);
  }
}

export function normalizeText(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

export function titleFromFilename(filename) {
  const name = (filename || '').replace(/\.txt$/i, '').trim();
  return name || '未命名';
}

export function parseTxt(buffer, filename) {
  return {
    title: titleFromFilename(filename),
    content: normalizeText(decodeTxt(buffer)),
  };
}
