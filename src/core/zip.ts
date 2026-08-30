// 最小 ZIP 读取器：只读，支持 STORE(0) 与 DEFLATE(8)，满足 EPUB 解包。
// 不引入第三方依赖；inflate 走标准 DecompressionStream('deflate-raw')。
// 不支持 ZIP64（电子书场景 < 4GB，不需要）。

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export interface ZipEntry {
  name: string;
  compressedSize: number;
  size: number;
  method: number;
  /** 本地文件头在 zip 中的偏移 */
  offset: number;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  const out = await new Response(stream).arrayBuffer();
  return new Uint8Array(out);
}

export class ZipArchive {
  private bytes: Uint8Array;
  private view: DataView;
  readonly entries: ZipEntry[];

  private constructor(bytes: Uint8Array, entries: ZipEntry[]) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.entries = entries;
  }

  static open(data: Uint8Array): ZipArchive {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    // 从尾部向前找 EOCD（注释区最长 65535 字节）
    const minEocd = Math.max(0, data.length - 22 - 65535);
    let eocd = -1;
    for (let i = data.length - 22; i >= minEocd; i--) {
      if (view.getUint32(i, true) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('ZIP: 未找到 EOCD，不是有效的 ZIP 文件');

    const count = view.getUint16(eocd + 10, true);
    let cursor = view.getUint32(eocd + 16, true);
    const entries: ZipEntry[] = [];
    for (let i = 0; i < count; i++) {
      if (view.getUint32(cursor, true) !== CEN_SIG) {
        throw new Error('ZIP: 中央目录损坏');
      }
      const method = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const size = view.getUint32(cursor + 24, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localOffset = view.getUint32(cursor + 42, true);
      const name = new TextDecoder().decode(
        data.subarray(cursor + 46, cursor + 46 + nameLen),
      );
      entries.push({ name, compressedSize, size, method, offset: localOffset });
      cursor += 46 + nameLen + extraLen + commentLen;
    }
    return new ZipArchive(data, entries);
  }

  entry(name: string): ZipEntry | undefined {
    return this.entries.find((e) => e.name === name);
  }

  /** 解压并返回条目内容；STORE 直接切片，DEFLATE 走 inflate */
  async read(entry: ZipEntry): Promise<Uint8Array> {
    const base = entry.offset;
    if (this.view.getUint32(base, true) !== LOC_SIG) {
      throw new Error(`ZIP: 条目 ${entry.name} 本地头损坏`);
    }
    const nameLen = this.view.getUint16(base + 26, true);
    const extraLen = this.view.getUint16(base + 28, true);
    const start = base + 30 + nameLen + extraLen;
    const raw = this.bytes.subarray(start, start + entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRaw(raw);
    throw new Error(`ZIP: 不支持的压缩方法 ${entry.method}（${entry.name}）`);
  }
}
