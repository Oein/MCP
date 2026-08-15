export type EasyEdaMcpErrorCode =
  | 'CONFIG_INVALID'
  | 'BRIDGE_NOT_CONNECTED'
  | 'BRIDGE_TIMEOUT'
  | 'BRIDGE_METHOD_NOT_AVAILABLE'
  | 'EASYEDA_API_ERROR'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'USER_CONFIRMATION_REQUIRED'
  | 'FEATURE_DISABLED'
  | 'PROFILE_NOT_ENABLED'
  | 'CREDENTIALS_MISSING'
  | 'VENDOR_API_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'ARTIFACT_EXPORT_FAILED'
  | 'SNAPSHOT_FAILED'
  | 'AI_PROVIDER_DISABLED'
  | 'AI_RESPONSE_INVALID'
  | 'NOT_IMPLEMENTED'
  | 'INTERNAL_ERROR';

export class EasyEdaMcpError extends Error {
  public readonly code: EasyEdaMcpErrorCode;
  public readonly suggestion: string;
  public readonly retryable: boolean;
  public readonly details: unknown;
  public readonly correlation_id: string | undefined;

  constructor(opts: {
    code: EasyEdaMcpErrorCode;
    message: string;
    suggestion: string;
    retryable: boolean;
    details?: unknown;
    correlation_id?: string;
  }) {
    super(opts.message);
    this.name = 'EasyEdaMcpError';
    this.code = opts.code;
    this.suggestion = opts.suggestion;
    this.retryable = opts.retryable;
    this.details = opts.details;
    this.correlation_id = opts.correlation_id;
  }
}
