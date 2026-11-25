export class ReceiptRecognitionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 422,
    public readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "ReceiptRecognitionError";
  }
}
