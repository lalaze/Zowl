export class AiCategorizationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 502,
    public readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "AiCategorizationError";
  }
}
