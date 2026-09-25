import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware } from "../middleware/auth.js";
import { scheduleCalendarService } from "../../services/scheduleCalendar.service.js";

export async function schedulesRoutes(server: FastifyInstance) {
  server.get(
    "/calendar",
    { preHandler: authMiddleware({ requiredScopes: ["admin"] }) },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        return await scheduleCalendarService.getCalendar();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load scheduled job calendar";
        return reply.code(500).send({ error: message });
      }
    }
  );
}
