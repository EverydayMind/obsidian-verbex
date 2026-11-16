/** Equality for stored JSON, parsed YAML and their structured data values. */
export function dataEqual(left: unknown, right: unknown): boolean {
  return compare(left, right, new Map(), new Map())
}

function compare(
  left: unknown,
  right: unknown,
  leftStack: Map<object, object>,
  rightStack: Map<object, object>,
  unordered = false,
): boolean {
  if (left === right || (Number.isNaN(left) && Number.isNaN(right))) return true
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object')
    return false
  const tag = String(Object.prototype.toString.call(left))
  if (tag !== Object.prototype.toString.call(right)) return false
  if (leftStack.has(left) || rightStack.has(right))
    return leftStack.get(left) === right && rightStack.get(right) === left
  leftStack.set(left, right)
  rightStack.set(right, left)
  const equal = (a: unknown, b: unknown) =>
    compare(a, b, leftStack, rightStack, unordered)
  try {
    if (left instanceof Date && right instanceof Date)
      return equal(+left, +right)
    if (left instanceof RegExp && right instanceof RegExp)
      return String(left) === String(right)
    if (left instanceof ArrayBuffer && right instanceof ArrayBuffer)
      return equal(new Uint8Array(left), new Uint8Array(right))
    if (left instanceof DataView && right instanceof DataView)
      return (
        left.byteOffset === right.byteOffset &&
        left.byteLength === right.byteLength &&
        equal(left.buffer, right.buffer)
      )
    if (left instanceof Map && right instanceof Map) {
      if (left.size !== right.size) return false
      return compare([...left], [...right], leftStack, rightStack, true)
    }
    if (left instanceof Set && right instanceof Set) {
      if (left.size !== right.size) return false
      return compare([...left], [...right], leftStack, rightStack, true)
    }
    if (Array.isArray(left) && Array.isArray(right)) {
      if (left.length !== right.length) return false
      if (!unordered)
        return Array.from(left).every((value, index) =>
          equal(value, right[index]),
        )
      const remaining = Array.from(right)
      return Array.from(left).every((value) => {
        const index = remaining.findIndex((other) => equal(value, other))
        if (index < 0) return false
        remaining.splice(index, 1)
        return true
      })
    }
    if (ArrayBuffer.isView(left) && ArrayBuffer.isView(right)) {
      const a = left as unknown as ArrayLike<unknown>
      const b = right as unknown as ArrayLike<unknown>
      return (
        a.length === b.length &&
        Array.from(a).every((value, index) => equal(value, b[index]))
      )
    }
    if (tag !== '[object Object]') return false
    const keys = (value: object) =>
      Reflect.ownKeys(value).filter((key) =>
        Object.prototype.propertyIsEnumerable.call(value, key),
      )
    const a = keys(left)
    const b = keys(right)
    return (
      a.length === b.length &&
      a.every(
        (key) =>
          b.includes(key) &&
          equal(Reflect.get(left, key), Reflect.get(right, key)),
      )
    )
  } finally {
    leftStack.delete(left)
    rightStack.delete(right)
  }
}
