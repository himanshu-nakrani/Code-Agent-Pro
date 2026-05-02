import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const testResultsTable = pgTable("test_results", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull(),
  passed: boolean("passed").notNull().default(false),
  output: text("output").notNull().default(""),
  errors: text("errors"),
  iteration: integer("iteration").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTestResultSchema = createInsertSchema(testResultsTable).omit({ id: true, createdAt: true });
export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
export type TestResult = typeof testResultsTable.$inferSelect;
