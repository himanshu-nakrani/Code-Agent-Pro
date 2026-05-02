import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentEventsTable = pgTable("agent_events", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  type: text("type").notNull().default("thought"),
  content: text("content").notNull(),
  iteration: integer("iteration").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAgentEventSchema = createInsertSchema(agentEventsTable).omit({ id: true, createdAt: true });
export type InsertAgentEvent = z.infer<typeof insertAgentEventSchema>;
export type AgentEvent = typeof agentEventsTable.$inferSelect;
