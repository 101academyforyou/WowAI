import fs from 'node:fs';

// 依檔案開頭的 magic bytes 判斷真實格式，不信任瀏覽器送來的 Content-Type。
const SIGNATURES = [
  { kind: 'image', ext: '.jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { kind: 'image', ext: '.png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { kind: 'image', ext: '.gif', test: (b) => ['GIF87a', 'GIF89a'].includes(b.toString('latin1', 0, 6)) },
  { kind: 'image', ext: '.webp', test: (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { kind: 'video', ext: '.webm', test: (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { kind: 'video', ext: '.mov', test: (b) => b.toString('latin1', 4, 8) === 'ftyp' && b.toString('latin1', 8, 12) === 'qt  ' },
  { kind: 'video', ext: '.mp4', test: (b) => b.toString('latin1', 4, 8) === 'ftyp' },
];

export function sniffMedia(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const head = Buffer.alloc(16);
    const read = fs.readSync(fd, head, 0, head.length, 0);
    if (read < 12) return null;
    const match = SIGNATURES.find((s) => s.test(head));
    return match ? { kind: match.kind, ext: match.ext } : null;
  } finally {
    fs.closeSync(fd);
  }
}

export const MEDIA_TYPES = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
};
