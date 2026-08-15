export type AuthenticationFailureCode =
  | "UNAUTHENTICATED"
  | "SESSION_EXPIRED"
  | "SESSION_REVOKED";

export class AuthenticationError extends Error {
  constructor(readonly code: AuthenticationFailureCode) {
    super("A valid authenticated session is required.");
  }
}

export interface VerifiedSession {
  userId: string;
  sessionId: string | null;
  expiresAt: number;
}

export interface SessionVerifier {
  verify(): Promise<VerifiedSession | null>;
}

export async function resolveIdentity(
  verifier: SessionVerifier,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  let session: VerifiedSession | null;
  try {
    session = await verifier.verify();
  } catch {
    throw new AuthenticationError("SESSION_REVOKED");
  }

  if (!session) {
    throw new AuthenticationError("UNAUTHENTICATED");
  }
  if (session.expiresAt <= nowSeconds) {
    throw new AuthenticationError("SESSION_EXPIRED");
  }

  return session;
}
