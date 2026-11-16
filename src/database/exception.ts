export class DatabaseException extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DatabaseException'
  }
}

export class DatabaseNotInitializedException extends DatabaseException {
  constructor(message = 'Database not initialized') {
    super(message)
    this.name = 'DatabaseNotInitializedException'
  }
}

export class DatabaseLoadRecoveredException extends DatabaseException {
  constructor(
    message = 'Database load failed and a new database was created from an empty state',
  ) {
    super(message)
    this.name = 'DatabaseLoadRecoveredException'
  }
}

export class DatabaseSaveException extends DatabaseException {
  constructor(message = 'Database save failed') {
    super(message)
    this.name = 'DatabaseSaveException'
  }
}

export class DuplicateTemplateException extends DatabaseException {
  constructor(templateName: string) {
    super(`Template with name "${templateName}" already exists`)
    this.name = 'DuplicateTemplateException'
  }
}

export class PGLiteAbortedException extends DatabaseException {
  constructor(message = 'PGLite aborted during runtime') {
    super(message)
    this.name = 'PGLiteAbortedException'
  }
}
