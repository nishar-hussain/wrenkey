import { FastifyInstance } from "fastify";

export async function securityHeaders(app: FastifyInstance) {
  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "1; mode=block");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    reply.header("Content-Security-Policy", "default-src 'self'");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    return payload;
  });
}
