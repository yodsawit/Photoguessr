/** An error whose message is safe to show to the client. Anything else becomes a generic 500. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}
