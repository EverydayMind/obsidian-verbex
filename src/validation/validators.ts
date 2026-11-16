import type { ValidateFunction } from 'ajv'

/* eslint @typescript-eslint/no-var-requires: "error", @typescript-eslint/no-require-imports: "error" -- Normalize both lint configurations for the single generated-module boundary below */
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports -- Literal require lets esbuild/Jest load generated code while its separate TS project isolates compiler inference.
const generated = require('./generated/schemaValidators') as Record<
  string,
  ValidateFunction
>

// Generated functions retain Ajv's mutable .errors property and calling contract.
export const validators: Record<string, ValidateFunction> = { ...generated }
Object.setPrototypeOf(validators, null)
