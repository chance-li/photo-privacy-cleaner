export type CleanerErrorCode = 'unsupported' | 'corrupt' | 'too-large' | 'decode'

export class CleanerError extends Error {
  readonly code: CleanerErrorCode

  constructor(message: string, code: CleanerErrorCode) {
    super(message)
    this.name = 'CleanerError'
    this.code = code
  }
}
