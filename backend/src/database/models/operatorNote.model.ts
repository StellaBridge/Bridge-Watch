import { getDatabase } from "../connection.js";

export interface OperatorNote {
  id: string;
  entity_type: string;
  entity_id: string;
  operator_address: string;
  content: string;
  category: string;
  is_internal: boolean;
  created_at: Date;
  updated_at: Date;
}

export class OperatorNoteModel {
  private db = getDatabase();
  private table = "operator_notes";

  async findById(id: string): Promise<OperatorNote | undefined> {
    return this.db(this.table).where({ id }).first();
  }

  async findByEntity(
    entityType: string,
    entityId: string
  ): Promise<OperatorNote[]> {
    return this.db(this.table)
      .where({ entity_type: entityType, entity_id: entityId })
      .orderBy("created_at", "desc");
  }

  async findByOperator(operatorAddress: string): Promise<OperatorNote[]> {
    return this.db(this.table)
      .where({ operator_address: operatorAddress })
      .orderBy("created_at", "desc");
  }

  async search(query: string, limit = 50): Promise<OperatorNote[]> {
    return this.db(this.table)
      .where("content", "ilike", `%${query}%`)
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  async create(
    data: Omit<OperatorNote, "id" | "created_at" | "updated_at">
  ): Promise<OperatorNote> {
    const [note] = await this.db(this.table).insert(data).returning("*");
    return note;
  }

  async update(
    id: string,
    operatorAddress: string,
    data: Partial<Pick<OperatorNote, "content" | "category" | "is_internal">>
  ): Promise<OperatorNote | undefined> {
    const [note] = await this.db(this.table)
      .where({ id, operator_address: operatorAddress })
      .update({ ...data, updated_at: new Date() })
      .returning("*");
    return note;
  }

  async delete(
    id: string,
    operatorAddress: string
  ): Promise<boolean> {
    const count = await this.db(this.table)
      .where({ id, operator_address: operatorAddress })
      .del();
    return count > 0;
  }
}
