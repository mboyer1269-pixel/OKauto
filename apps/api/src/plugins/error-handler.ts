import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { AppError, statusCodeFor, toErrorBody } from "@okauto/shared";

export default fp(async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((err: unknown, request, reply) => {
    if (err instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      });
    }
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(toErrorBody(err));
    }
    const fastifyErr = err as { statusCode?: number; message?: string };
    const statusCode = fastifyErr.statusCode;
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: "RATE_LIMITED", message: "Too many requests" } });
    }
    if (statusCode === 413) {
      return reply.status(413).send({ error: { code: "PAYLOAD_TOO_LARGE", message: "Payload too large" } });
    }
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.status(statusCode).send({
        error: { code: "VALIDATION_ERROR", message: fastifyErr.message ?? "Request failed" },
      });
    }
    request.log.error({ err, requestId: request.id }, "unhandled error");
    return reply.status(statusCodeFor(err)).send(toErrorBody(err));
  });

  app.setNotFoundHandler((_request, reply) => {
    reply.status(404).send({ error: { code: "NOT_FOUND", message: "Route not found" } });
  });
});
