/**
 * テスト専用の最小 QR デコーダ（バージョン 1〜10・数字／英数字／8bit バイトモード）。
 *
 * ポスターの QR が「本当にその URL として読める」ことを、生成側（qrcode パッケージ）と
 * **独立した実装**で確かめるために置く。生成ライブラリ自身の関数で読み戻すと、
 * 同じ誤りを両側が共有して緑になるため使わない。デコード用の依存も追加しない。
 *
 * 検査すること:
 * - 形式情報（誤り訂正レベル・マスク）が BCH 符号として正しく、2 か所のコピーが一致する
 * - 3 隅のファインダーパターンが 7x7 の正しい形をしている
 * - 各ブロックのリード・ソロモン符号のシンドロームがすべて 0（＝誤りの無い正しい符号語）
 *
 * 誤り訂正（壊れた QR の復元）はしない。正しく生成された QR を読むためだけのもの。
 *
 * このファイルは型注釈以外の TypeScript 構文を使わない（Playwright の確認スクリプトから
 * `node --experimental-strip-types` で読み込むため）。
 */

export type EcLevel = 'L' | 'M' | 'Q' | 'H';

export interface DecodedQr {
  text: string;
  version: number;
  ecLevel: EcLevel;
  mask: number;
}

// 形式情報の誤り訂正レベル 2bit → 記号（ISO/IEC 18004 表 12）
const EC_BITS: Record<number, EcLevel> = { 0b01: 'L', 0b00: 'M', 0b11: 'Q', 0b10: 'H' };

// [データ符号語数, ブロック数] の組と、ブロックあたりの誤り訂正符号語数（ISO/IEC 18004 表 9）
type BlockSpec = { ec: number; groups: Array<[count: number, dataLen: number]> };
const BLOCKS: Record<EcLevel, Record<number, BlockSpec>> = {
  L: {
    1: { ec: 7, groups: [[1, 19]] },
    2: { ec: 10, groups: [[1, 34]] },
    3: { ec: 15, groups: [[1, 55]] },
    4: { ec: 20, groups: [[1, 80]] },
    5: { ec: 26, groups: [[1, 108]] },
    6: { ec: 18, groups: [[2, 68]] },
    7: { ec: 20, groups: [[2, 78]] },
    8: { ec: 24, groups: [[2, 97]] },
    9: { ec: 30, groups: [[2, 116]] },
    10: { ec: 18, groups: [[2, 68], [2, 69]] },
  },
  M: {
    1: { ec: 10, groups: [[1, 16]] },
    2: { ec: 16, groups: [[1, 28]] },
    3: { ec: 26, groups: [[1, 44]] },
    4: { ec: 18, groups: [[2, 32]] },
    5: { ec: 24, groups: [[2, 43]] },
    6: { ec: 16, groups: [[4, 27]] },
    7: { ec: 18, groups: [[4, 31]] },
    8: { ec: 22, groups: [[2, 38], [2, 39]] },
    9: { ec: 22, groups: [[3, 36], [2, 37]] },
    10: { ec: 26, groups: [[4, 43], [1, 44]] },
  },
  Q: {
    1: { ec: 13, groups: [[1, 13]] },
    2: { ec: 22, groups: [[1, 22]] },
    3: { ec: 18, groups: [[2, 17]] },
    4: { ec: 26, groups: [[2, 24]] },
    5: { ec: 18, groups: [[2, 15], [2, 16]] },
    6: { ec: 24, groups: [[4, 19]] },
    7: { ec: 18, groups: [[2, 14], [4, 15]] },
    8: { ec: 22, groups: [[4, 18], [2, 19]] },
    9: { ec: 20, groups: [[4, 16], [4, 17]] },
    10: { ec: 24, groups: [[6, 19], [2, 20]] },
  },
  H: {
    1: { ec: 17, groups: [[1, 9]] },
    2: { ec: 28, groups: [[1, 16]] },
    3: { ec: 22, groups: [[2, 13]] },
    4: { ec: 16, groups: [[4, 9]] },
    5: { ec: 22, groups: [[2, 11], [2, 12]] },
    6: { ec: 28, groups: [[4, 15]] },
    7: { ec: 26, groups: [[4, 13], [1, 14]] },
    8: { ec: 26, groups: [[4, 14], [2, 15]] },
    9: { ec: 24, groups: [[4, 12], [4, 13]] },
    10: { ec: 28, groups: [[6, 15], [2, 16]] },
  },
};

// 位置合わせパターンの中心座標（ISO/IEC 18004 附属書 E）
const ALIGNMENT: Record<number, number[]> = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
};

const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

function formatCodeword(data5: number): number {
  let v = data5 << 10;
  for (let i = 14; i >= 10; i--) {
    if (v & (1 << i)) v ^= 0x537 << (i - 10);
  }
  return ((data5 << 10) | (v & 0x3ff)) ^ 0x5412;
}

function readFormat(m: boolean[][]): { ecLevel: EcLevel; mask: number } {
  const n = m.length;
  const bit = (row: number, col: number) => (m[row][col] ? 1 : 0);
  const copy1: number[] = [];
  for (let c = 0; c <= 5; c++) copy1.push(bit(8, c));
  copy1.push(bit(8, 7), bit(8, 8), bit(7, 8));
  for (let r = 5; r >= 0; r--) copy1.push(bit(r, 8));
  const copy2: number[] = [];
  for (let r = n - 1; r >= n - 7; r--) copy2.push(bit(r, 8));
  for (let c = n - 8; c < n; c++) copy2.push(bit(8, c));
  const toInt = (bits: number[]) => bits.reduce((acc, b) => (acc << 1) | b, 0);
  const v1 = toInt(copy1);
  const v2 = toInt(copy2);
  if (v1 !== v2) throw new Error(`format info copies differ: ${v1.toString(2)} / ${v2.toString(2)}`);
  for (let d = 0; d < 32; d++) {
    if (formatCodeword(d) === v1) {
      return { ecLevel: EC_BITS[d >> 3], mask: d & 0b111 };
    }
  }
  throw new Error(`format info is not a valid BCH codeword: ${v1.toString(2)}`);
}

function assertFinder(m: boolean[][], top: number, left: number): void {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      const expected = ring !== 2; // 外周(3)=黒・その内側(2)=白・中央 3x3(0,1)=黒
      if (m[top + r][left + c] !== expected) {
        throw new Error(`finder pattern broken at (${top + r}, ${left + c})`);
      }
    }
  }
}

function functionMask(version: number): boolean[][] {
  const n = version * 4 + 17;
  const f = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fill = (r0: number, c0: number, h: number, w: number) => {
    for (let r = r0; r < r0 + h; r++) for (let c = c0; c < c0 + w; c++) f[r][c] = true;
  };
  fill(0, 0, 9, 9); // 左上ファインダー + 分離帯 + 形式情報
  fill(0, n - 8, 9, 8); // 右上
  fill(n - 8, 0, 8, 9); // 左下（ダークモジュールを含む）
  fill(6, 0, 1, n); // タイミング
  fill(0, 6, n, 1);
  const centers = ALIGNMENT[version];
  for (const r of centers) {
    for (const c of centers) {
      const onFinder =
        (r === 6 && c === 6) || (r === 6 && c === centers[centers.length - 1]) || (r === centers[centers.length - 1] && c === 6);
      if (!onFinder) fill(r - 2, c - 2, 5, 5);
    }
  }
  if (version >= 7) {
    fill(0, n - 11, 6, 3);
    fill(n - 11, 0, 3, 6);
  }
  return f;
}

function maskBit(mask: number, i: number, j: number): boolean {
  switch (mask) {
    case 0: return (i + j) % 2 === 0;
    case 1: return i % 2 === 0;
    case 2: return j % 3 === 0;
    case 3: return (i + j) % 3 === 0;
    case 4: return (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0;
    case 5: return ((i * j) % 2) + ((i * j) % 3) === 0;
    case 6: return (((i * j) % 2) + ((i * j) % 3)) % 2 === 0;
    case 7: return (((i + j) % 2) + ((i * j) % 3)) % 2 === 0;
    default: throw new Error(`bad mask ${mask}`);
  }
}

// GF(256)（原始多項式 0x11D）
const EXP = new Array<number>(512);
const LOG = new Array<number>(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gfMul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

function assertNoErrors(block: number[], blockIndex: number, ec: number): void {
  for (let i = 0; i < ec; i++) {
    let s = 0;
    const alpha = EXP[i];
    for (const c of block) s = gfMul(s, alpha) ^ c; // Horner 法で c(α^i)
    if (s !== 0) throw new Error(`Reed-Solomon syndrome ${i} of block ${blockIndex} is not zero`);
  }
}

class BitReader {
  private pos = 0;
  private readonly bytes: number[];
  constructor(bytes: number[]) {
    this.bytes = bytes;
  }
  get remaining(): number {
    return this.bytes.length * 8 - this.pos;
  }
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.bytes[this.pos >> 3];
      v = (v << 1) | ((byte >> (7 - (this.pos & 7))) & 1);
      this.pos++;
    }
    return v;
  }
}

function parseSegments(data: number[], version: number): string {
  const r = new BitReader(data);
  const big = version >= 10;
  const bytes: number[] = [];
  let out = '';
  const flushBytes = () => {
    if (bytes.length) out += new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    bytes.length = 0;
  };
  while (r.remaining >= 4) {
    const mode = r.read(4);
    if (mode === 0) break;
    if (mode === 0b0001) {
      flushBytes();
      let count = r.read(big ? 12 : 10);
      while (count >= 3) {
        out += String(r.read(10)).padStart(3, '0');
        count -= 3;
      }
      if (count === 2) out += String(r.read(7)).padStart(2, '0');
      if (count === 1) out += String(r.read(4));
    } else if (mode === 0b0010) {
      flushBytes();
      let count = r.read(big ? 11 : 9);
      while (count >= 2) {
        const v = r.read(11);
        out += ALNUM[Math.floor(v / 45)] + ALNUM[v % 45];
        count -= 2;
      }
      if (count === 1) out += ALNUM[r.read(6)];
    } else if (mode === 0b0100) {
      const count = r.read(big ? 16 : 8);
      for (let i = 0; i < count; i++) bytes.push(r.read(8));
    } else {
      throw new Error(`unsupported mode indicator ${mode.toString(2)}`);
    }
  }
  flushBytes();
  return out;
}

/** モジュール行列（true = 黒、クワイエットゾーンを含まない）を読む */
export function decodeQrMatrix(m: boolean[][]): DecodedQr {
  const n = m.length;
  if (m.some((row) => row.length !== n)) throw new Error('matrix is not square');
  const version = (n - 17) / 4;
  if (!Number.isInteger(version) || version < 1 || version > 10) {
    throw new Error(`unsupported size ${n} (version 1-10 only)`);
  }
  assertFinder(m, 0, 0);
  assertFinder(m, 0, n - 7);
  assertFinder(m, n - 7, 0);

  const { ecLevel, mask } = readFormat(m);
  const reserved = functionMask(version);

  const bits: number[] = [];
  let upward = true;
  for (let right = n - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < n; v++) {
      const row = upward ? n - 1 - v : v;
      for (let k = 0; k < 2; k++) {
        const col = right - k;
        if (reserved[row][col]) continue;
        bits.push((m[row][col] !== maskBit(mask, row, col)) ? 1 : 0);
      }
    }
    upward = !upward;
  }

  const spec = BLOCKS[ecLevel][version];
  const dataLens: number[] = [];
  for (const [count, len] of spec.groups) for (let i = 0; i < count; i++) dataLens.push(len);
  const total = dataLens.reduce((a, b) => a + b, 0) + spec.ec * dataLens.length;
  const codewords: number[] = [];
  for (let i = 0; i < total; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) byte = (byte << 1) | bits[i * 8 + b];
    codewords.push(byte);
  }

  const blocks: number[][] = dataLens.map(() => []);
  let p = 0;
  const maxLen = Math.max(...dataLens);
  for (let i = 0; i < maxLen; i++) {
    for (let b = 0; b < blocks.length; b++) if (i < dataLens[b]) blocks[b].push(codewords[p++]);
  }
  for (let i = 0; i < spec.ec; i++) {
    for (let b = 0; b < blocks.length; b++) blocks[b].push(codewords[p++]);
  }
  blocks.forEach((block, i) => assertNoErrors(block, i, spec.ec));

  const data: number[] = [];
  blocks.forEach((block, i) => data.push(...block.slice(0, dataLens[i])));
  return { text: parseSegments(data, version), version, ecLevel, mask };
}
