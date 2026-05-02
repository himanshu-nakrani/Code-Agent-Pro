import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentFilesTable = pgTable("agent_files", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  name: text("name").notNull(),
  content: text("content").notNull().default(""),
  language: text("language").notNull().default("text"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAgentFileSchema = createInsertSchema(agentFilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentFile = z.infer<typeof insertAgentFileSchema>;
export type AgentFile = typeof agentFilesTable.$inferSelect;
