import { OperatorNoteModel, type OperatorNote } from "../database/models/operatorNote.model.js";
import { logger } from "../utils/logger.js";

export interface CreateNoteInput {
  entityType: string;
  entityId: string;
  operatorAddress: string;
  content: string;
  category?: string;
  isInternal?: boolean;
}

export interface UpdateNoteInput {
  content?: string;
  category?: string;
  isInternal?: boolean;
}

export class OperatorNotesService {
  private model = new OperatorNoteModel();

  async createNote(input: CreateNoteInput): Promise<OperatorNote> {
    const note = await this.model.create({
      entity_type: input.entityType,
      entity_id: input.entityId,
      operator_address: input.operatorAddress,
      content: input.content,
      category: input.category ?? "general",
      is_internal: input.isInternal ?? false,
    });

    logger.info(
      { noteId: note.id, entityType: input.entityType, entityId: input.entityId },
      "Operator note created"
    );

    return note;
  }

  async getNote(id: string): Promise<OperatorNote | undefined> {
    return this.model.findById(id);
  }

  async getNotesForEntity(
    entityType: string,
    entityId: string
  ): Promise<OperatorNote[]> {
    return this.model.findByEntity(entityType, entityId);
  }

  async getNotesByOperator(
    operatorAddress: string
  ): Promise<OperatorNote[]> {
    return this.model.findByOperator(operatorAddress);
  }

  async searchNotes(query: string, limit?: number): Promise<OperatorNote[]> {
    return this.model.search(query, limit);
  }

  async updateNote(
    id: string,
    operatorAddress: string,
    input: UpdateNoteInput
  ): Promise<OperatorNote | undefined> {
    const note = await this.model.update(id, operatorAddress, {
      content: input.content,
      category: input.category,
      is_internal: input.isInternal,
    });

    if (note) {
      logger.info({ noteId: id }, "Operator note updated");
    }

    return note;
  }

  async deleteNote(
    id: string,
    operatorAddress: string
  ): Promise<boolean> {
    const deleted = await this.model.delete(id, operatorAddress);

    if (deleted) {
      logger.info({ noteId: id }, "Operator note deleted");
    }

    return deleted;
  }
}
