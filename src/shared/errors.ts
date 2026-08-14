export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "AuthError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

/**
 * 403 with the compliance failure reason as the error code, so the client
 * can route to the right remediation screen (age gate, terms, consent, …).
 */
export class ComplianceError extends AppError {
  constructor(reason: string, message = "Account compliance requirements not met") {
    super(message, 403, reason);
    this.name = "ComplianceError";
  }
}

/**
 * 422 for messages rejected by pre-delivery moderation. The message reason is
 * neutral and never echoes the offending content. `quarantined` distinguishes
 * "classifier unavailable, try again" from a definite policy block.
 */
export class ContentBlockedError extends AppError {
  public quarantined: boolean;
  constructor(quarantined = false) {
    super(
      quarantined
        ? "Your message couldn't be sent right now. Please try again in a moment."
        : "This message can't be sent because it may violate our Community Guidelines.",
      422,
      quarantined ? "message_quarantined" : "message_blocked",
    );
    this.name = "ContentBlockedError";
    this.quarantined = quarantined;
  }
}

export class UpgradeRequiredError extends AppError {
  public requiredTier: string;

  constructor(requiredTier: string, message = "This feature requires an upgrade") {
    super(message, 403, "UPGRADE_REQUIRED");
    this.name = "UpgradeRequiredError";
    this.requiredTier = requiredTier;
  }
}
