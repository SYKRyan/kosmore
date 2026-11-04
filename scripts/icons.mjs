import { mkdir, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
function crc(b) {
  let c = 0xffffffff;
  for (const n of b) {
    c ^= n;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type),
    n = Buffer.alloc(4),
    c = Buffer.alloc(4);
  n.writeUInt32BE(data.length);
  c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([n, t, data, c]);
}
export async function generateIcons() {
  await mkdir("public/icons", { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const raw = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = x / size,
          v = y / size;
        let color = [26, 17, 53, 255];
        if (u > 0.2 && u < 0.68 && v > 0.19 && v < 0.83)
          color = [113, 87, 156, 255];
        if (u > 0.34 && u < 0.8 && v > 0.13 && v < 0.77)
          color = [241, 205, 120, 255];
        if (u > 0.38 && u < 0.76 && v > 0.17 && v < 0.73)
          color = [42, 29, 76, 255];
        if (
          Math.abs(u - 0.57) + Math.abs(v - 0.43) < 0.17 ||
          (Math.abs(u - 0.57) < 0.023 && Math.abs(v - 0.43) < 0.24) ||
          (Math.abs(v - 0.43) < 0.023 && Math.abs(u - 0.57) < 0.2)
        )
          color = [255, 222, 142, 255];
        raw.set(color, y * (size * 4 + 1) + 1 + x * 4);
      }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    await writeFile(
      `public/icons/${size}.png`,
      Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
      ]),
    );
  }
}
