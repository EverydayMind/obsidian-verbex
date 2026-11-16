import { isSubstantiveUserText } from './taskPinning'

/** Submission intent, shared by planning and pre-model provider preparation. */
export function isBareContinuation(input: {
  request: string
  isFirstTurn: boolean
  isContinuationSignal?: boolean
}): boolean {
  return (
    !input.isFirstTurn &&
    (input.isContinuationSignal === true ||
      !isSubstantiveUserText(input.request))
  )
}
