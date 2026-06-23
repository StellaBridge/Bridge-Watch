import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperatorNotesService } from "../../src/services/operatorNotes.service.js";

vi.mock("../../src/database/connection.js", () => {
  const notes: Record<string, unknown>[] = [];
  let idCounter = 0;

  const chainable = (rows: unknown[]) => ({
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => rows),
    first: vi.fn().mockImplementation(async () => rows[0] ?? null),
    insert: vi.fn().mockImplementation(async () => rows),
    update: vi.fn().mockImplementation(async () => 1),
    del: vi.fn().mockImplementation(async () => rows.length),
    returning: vi.fn().mockImplementation(async () => rows),
    ilike: vi.fn().mockReturnThis(),
  });

  return {
    getDatabase: vi.fn(() => ({
      raw: vi.fn((sql: string) => sql),
      fn: { now: () => new Date() },
      operator_notes: {
        ...chainable([]),
        insert: vi.fn().mockImplementation(async (data: Record<string, unknown>) => {
          idCounter++;
          const row = { id: `note-${idCounter}`, ...data, created_at: new Date(), updated_at: new Date() };
          notes.push(row);
          return row;
        }),
      },
    })),
  };
});

describe("OperatorNotesService", () => {
  let service: OperatorNotesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new OperatorNotesService();
  });

  it("should be instantiable", () => {
    expect(service).toBeInstanceOf(OperatorNotesService);
  });
});
