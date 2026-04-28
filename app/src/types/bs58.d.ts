declare module "bs58" {
  function encode(buffer: Uint8Array | Buffer): string;
  function decode(string: string): Uint8Array;
  export { encode, decode };
  export default { encode, decode };
}
