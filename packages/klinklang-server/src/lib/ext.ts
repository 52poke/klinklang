export default function patchBigInt (): void {
  // @ts-expect-error -- Patch BigInt to support JSON.stringify
  // eslint-disable-next-line no-extend-native -- Patch BigInt to support JSON.stringify
  BigInt.prototype.toJSON = function() {
    return this.toString()
  }
}
