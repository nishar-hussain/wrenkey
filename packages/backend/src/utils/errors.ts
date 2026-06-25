import { FastifyReply } from "fastify";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code: string = "INTERNAL_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, "NOT_FOUND");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, message, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, message, "FORBIDDEN");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, "VALIDATION_ERROR");
  }
}

export function sendSuccess(reply: FastifyReply, data: unknown, statusCode = 200) {
  return reply.status(statusCode).send(data);
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: { code: error.code, message: error.message },
    });
  }
  const err = error as any;
  console.error("[sendError] Unhandled error:", err?.message || err, err?.stack || "");
  return reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: err?.message || "Internal server error" },
  });
}
