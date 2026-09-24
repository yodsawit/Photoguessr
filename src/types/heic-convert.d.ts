declare module 'heic-convert' {
  type Options = { buffer: Buffer | ArrayBufferLike; format: 'JPEG' | 'PNG'; quality?: number }
  export default function convert(options: Options): Promise<ArrayBuffer>
}
