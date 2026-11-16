import type { ValidateFunction } from 'ajv'

import { validatorDefinitions } from './schemaDefinitions'
import { createSchemaValidator } from './schemaInterpreter'

export const validators: Record<string, ValidateFunction> = Object.fromEntries(
  validatorDefinitions().map(({ name, schema, options, refs }) => [
    name,
    createSchemaValidator(schema, options, refs),
  ]),
)
Object.setPrototypeOf(validators, null)
