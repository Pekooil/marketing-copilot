export type ConnectorErrorClass = "configuration" | "credential" | "permission" | "mapping" | "rate_limited" | "temporary" | "invalid_response";

export class ConnectorError extends Error {
  readonly code: string;
  readonly classification: ConnectorErrorClass;
  readonly retryable: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(input: { code: string; classification: ConnectorErrorClass; message: string; retryable?: boolean; retryAfterSeconds?: number | null }) {
    super(input.message);
    this.name = "ConnectorError";
    this.code = input.code;
    this.classification = input.classification;
    this.retryable = input.retryable ?? false;
    this.retryAfterSeconds = input.retryAfterSeconds ?? null;
  }
}
