import { type ModelLocale, getModelLocale } from '../../i18n/modelLocale'
import { L } from '../../i18n/modelText'

import { prepareParameters, produceParameters } from './documentJobToolSchemas'

/** Reuse the deployed Korean schemas without duplicating their strings/contracts. */
function describe<T extends { description: string }>(
  property: T,
  en: string,
  locale: ModelLocale,
): T {
  return {
    ...property,
    description: L({ ko: property.description, en }, locale),
  }
}

export function getPrepareParameters(locale: ModelLocale = getModelLocale()) {
  const ko = prepareParameters.properties
  return {
    ...prepareParameters,
    properties: {
      sample_path: describe(
        ko.sample_path,
        'Sample HWP/HWPX path for a new job. Set only when starting a new job.',
        locale,
      ),
      output_name: describe(
        ko.output_name,
        'Optional new document name, not a path.',
        locale,
      ),
      base_font_pt: describe(
        ko.base_font_pt,
        'Base body font size for a new job (pt, 6–40 in 0.5 steps). Defaults to the setting.',
        locale,
      ),
      job_id: describe(
        ko.job_id,
        'For a body-selection reply, use the previous result’s job_id unchanged. Do not invent one.',
        locale,
      ),
      choices: describe(
        ko.choices,
        'For a body-selection reply, pass choices from the previous question.',
        locale,
      ),
    },
  }
}

export function getProduceParameters(locale: ModelLocale = getModelLocale()) {
  const ko = produceParameters.properties
  return {
    ...produceParameters,
    properties: {
      job_id: describe(
        ko.job_id,
        'job_id from the previous preparation result’s nextStep.arguments.',
        locale,
      ),
      draft_path: describe(
        ko.draft_path,
        'Saved Markdown draft path from nextStep.arguments.',
        locale,
      ),
      output_path: describe(
        ko.output_path,
        'New HWPX path from nextStep.arguments.',
        locale,
      ),
    },
  }
}
