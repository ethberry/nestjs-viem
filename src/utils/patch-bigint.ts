export function patchBigInt() {
  // https://github.com/GoogleChromeLabs/jsbi/issues/30

  Object.defineProperty(BigInt.prototype, "toJSON", {
    value: function (this: bigint) {
      return this.toString();
    },
    configurable: true,
    enumerable: false,
    writable: true,
  });
}
