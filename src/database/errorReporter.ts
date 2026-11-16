/** Presentation is injected by the host; storage does not own modal UI. */
export type DatabaseErrorReporter = (
  title: string,
  message: string,
  log?: string,
) => void

export const logDatabaseError: DatabaseErrorReporter = (
  title,
  message,
  log,
) => {
  console.error(title, message, log)
}
