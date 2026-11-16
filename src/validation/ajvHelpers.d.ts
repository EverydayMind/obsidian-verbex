declare module 'ajv/lib/compile/formats' {
  const formats: (
    mode?: string | false,
  ) => Record<string, RegExp | ((data: string) => boolean)>
  export default formats
}
declare module 'ajv/lib/compile/ucs2length' {
  const ucs2length: (data: string) => number
  export default ucs2length
}
