/** The Buffer operations used by the desktop plugin; no ambient Node types. */
export type NodeBuffer = Omit<Uint8Array, 'toString' | 'subarray'> & {
  toString(encoding?: string, start?: number, end?: number): string
  subarray(start?: number, end?: number): NodeBuffer
  readUInt32BE(offset: number): number
  readUInt16BE(offset: number): number
}

export type NodeBufferConstructor = {
  from(input: string, encoding?: string): NodeBuffer
  from(input: ArrayBuffer | ArrayLike<number>): NodeBuffer
  byteLength(input: string, encoding?: string): number
  concat(chunks: readonly Uint8Array[]): NodeBuffer
}
