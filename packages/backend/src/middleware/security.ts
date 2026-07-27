import { FastifyInstance } from "fastify";

export async function securityHeaders(app: FastifyInstance) {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-XSS-Protection", "0");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

    const ct = reply.getHeader("content-type");
    if (ct && String(ct).includes("text/html")) {
      reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://localhost:*");
    }
  });
}
