import profileSchema from '../../../contracts/report-style/v1/profile.schema.json'

export const bindingInput = {
  ...profileSchema.properties.bindings,
  items: {
    ...profileSchema.properties.bindings.items,
    required: profileSchema.properties.bindings.items.required.filter(
      (field) => field !== 'assignedBy',
    ),
    properties: {
      ...profileSchema.properties.bindings.items.properties,
      assignedBy: { enum: ['model'] },
    },
  },
}
