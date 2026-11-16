import { Buffer } from 'buffer'

import type { ToolImage } from '../../core/llm/toolImages'

import { RESULT_LIMITS, copyJson } from './descriptorReader'
import type { ToolDescriptor } from './protocol'
import { readToolResult } from './resultReader'

const MAX_BYTES = 2 * 1024 * 1024
const MAX_EDGE = 1280
const MAX_PIXELS = 4_000_000

/** Data properties only; never invoke provider getters, including array accessors. */
function fields(value: unknown): Record<string, PropertyDescriptor> {
  if (
    !value ||
    typeof value !== 'object' ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  )
    throw new Error('Invalid browser image object')
  const result = Object.getOwnPropertyDescriptors(value)
  if (
    Reflect.ownKeys(result).some(
      (key) =>
        typeof key !== 'string' ||
        !('value' in result[key]) ||
        !result[key].enumerable,
    )
  )
    throw new Error('Unsafe browser image property')
  return result
}
function plain(fields: Record<string, PropertyDescriptor>): object {
  return Object.defineProperties({}, fields)
}

export async function decodeBrowserImage(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ width: number; height: number }> {
  const blob = new Blob([Uint8Array.from(bytes)], { type: mimeType })
  const image = await createImageBitmap(blob)
  try {
    return { width: image.width, height: image.height }
  } finally {
    image.close()
  }
}

/** The image's compressed bytes have a separate cap; ordinary JSON limits stay unchanged. */
export async function readBrowserImageResult(
  raw: unknown,
  tool: ToolDescriptor,
  acceptsImages: boolean,
  vaultPath: (path: string) => string,
  decode = decodeBrowserImage,
) {
  const root = fields(raw)
  const content: unknown = root.content?.value
  if (
    !Array.isArray(content) ||
    Object.getPrototypeOf(content) !== Array.prototype ||
    content.length > 128 ||
    Reflect.ownKeys(content).length !== content.length + 1
  )
    throw new Error('Invalid browser image content')
  const texts: object[] = []
  const images: ToolImage[] = []
  for (let i = 0; i < content.length; i++) {
    const entry = Object.getOwnPropertyDescriptor(content, i)
    if (!entry || !('value' in entry)) throw new Error('Unsafe content array')
    const item = fields(entry.value)
    if (item.type?.value !== 'image') {
      texts.push(plain(item))
      continue
    }
    if (
      !acceptsImages ||
      images.length ||
      Object.keys(item).sort().join(',') !== 'data,mimeType,type'
    )
      throw new Error('Unsupported browser image result')
    const mime: unknown = item.mimeType?.value
    const data: unknown = item.data?.value
    if (
      (mime !== 'image/png' && mime !== 'image/jpeg') ||
      typeof data !== 'string' ||
      !data.length ||
      data.length > 4 * Math.ceil(MAX_BYTES / 3) ||
      data.length % 4 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
    )
      throw new Error('Invalid browser image encoding')
    const bytes = Buffer.from(data, 'base64')
    if (
      !bytes.length ||
      bytes.length > MAX_BYTES ||
      bytes.toString('base64') !== data
    )
      throw new Error('Invalid browser image size')
    const png = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    if ((mime === 'image/png' && !png) || (mime === 'image/jpeg' && !jpeg))
      throw new Error('Browser image MIME mismatch')
    // Decoder allocation is bounded by validating dimensions before native decode.
    const size = encodedDimensions(bytes, png)
    checkDimensions(size)
    const decoded = await decode(bytes, mime)
    checkDimensions(decoded)
    if (size.width !== decoded.width || size.height !== decoded.height)
      throw new Error('Browser image dimensions disagree')
    images.push({ url: `data:${mime};base64,${data}`, ...decoded })
  }
  root.content = {
    value: texts,
    enumerable: true,
    configurable: true,
    writable: true,
  }
  const safe = copyJson(
    plain(root),
    RESULT_LIMITS,
  ) as import('./protocol').JsonObject
  const structured = safe.structuredContent
  if (
    images.length &&
    structured &&
    typeof structured === 'object' &&
    !Array.isArray(structured)
  ) {
    const geometry = structured.coordinateTransform
    if (
      geometry &&
      typeof geometry === 'object' &&
      !Array.isArray(geometry) &&
      (geometry.imageWidth !== images[0].width ||
        geometry.imageHeight !== images[0].height)
    )
      throw new Error('Browser image coordinate dimensions disagree')
  }
  const result = readToolResult(safe, tool, vaultPath)
  return {
    ...result,
    images: !result.isError && !result.truncated ? images : [],
  }
}

function checkDimensions(size: { width: number; height: number }) {
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    Math.max(size.width, size.height) > MAX_EDGE ||
    size.width * size.height > MAX_PIXELS
  )
    throw new Error('Browser image dimensions exceed limits')
}
function encodedDimensions(
  bytes: Buffer,
  png: boolean,
): { width: number; height: number } {
  if (png) {
    if (bytes.length < 33 || bytes.toString('ascii', 12, 16) !== 'IHDR')
      throw new Error('Invalid PNG header')
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset++] !== 0xff) throw new Error('Invalid JPEG marker')
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    if (offset + 2 > bytes.length) break
    const length = bytes.readUInt16BE(offset)
    if (length < 2 || offset + length > bytes.length) break
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8)
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      }
    offset += length
  }
  throw new Error('Unsupported JPEG dimensions')
}
