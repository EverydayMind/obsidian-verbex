/** Forward an existing failure unchanged, including legacy non-Error reasons. */
export function forwardRejection(
  settle: (reason: unknown) => void,
  reason: unknown,
): void {
  settle(reason)
}
