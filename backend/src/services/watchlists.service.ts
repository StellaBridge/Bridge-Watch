import { getDatabase } from "../database/connection.js";

const db = getDatabase();

export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  assets: string[];
}

export class WatchlistsService {
  async getWatchlists(userId: string): Promise<Watchlist[]> {
    const watchlists = await db("watchlists")
      .where({ user_id: userId })
      .orderBy("created_at", "asc");

    if (watchlists.length === 0) {
      return [];
    }

    const watchlistIds = watchlists.map((w: any) => w.id);
    
    const assets = await db("watchlist_assets")
      .whereIn("watchlist_id", watchlistIds)
      .orderBy("sort_order", "asc");

    return watchlists.map((w: any) => {
      const wAssets = assets
        .filter((a: any) => a.watchlist_id === w.id)
        .map((a: any) => a.symbol);
      
      return {
        id: w.id,
        userId: w.user_id,
        name: w.name,
        isDefault: w.is_default,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        assets: wAssets,
      };
    });
  }

  async createWatchlist(userId: string, name: string, isDefault = false): Promise<Watchlist> {
    if (isDefault) {
      await db("watchlists").where({ user_id: userId }).update({ is_default: false });
    }

    const [watchlist] = await db("watchlists")
      .insert({
        user_id: userId,
        name,
        is_default: isDefault,
      })
      .returning("*");

    return {
      id: watchlist.id,
      userId: watchlist.user_id,
      name: watchlist.name,
      isDefault: watchlist.is_default,
      createdAt: watchlist.created_at,
      updatedAt: watchlist.updated_at,
      assets: [],
    };
  }

  async deleteWatchlist(userId: string, id: string): Promise<void> {
    await db("watchlists").where({ id, user_id: userId }).delete();
  }

  async setWatchlistDefault(userId: string, id: string): Promise<void> {
    await db.transaction(async (trx) => {
      await trx("watchlists").where({ user_id: userId }).update({ is_default: false });
      await trx("watchlists").where({ id, user_id: userId }).update({ is_default: true, updated_at: db.fn.now() });
    });
  }

  async renameWatchlist(userId: string, id: string, name: string): Promise<void> {
    await db("watchlists").where({ id, user_id: userId }).update({ name, updated_at: db.fn.now() });
  }

  async updateWatchlistAssets(userId: string, id: string, assets: string[]): Promise<void> {
    // verify ownership
    const watchlist = await db("watchlists").where({ id, user_id: userId }).first();
    if (!watchlist) throw new Error("Watchlist not found");

    await db.transaction(async (trx) => {
      // Delete existing assets for this watchlist
      await trx("watchlist_assets").where({ watchlist_id: id }).delete();
      
      // Insert new ones in order
      if (assets.length > 0) {
        const rows = assets.map((symbol, index) => ({
          watchlist_id: id,
          symbol,
          sort_order: index,
        }));
        await trx("watchlist_assets").insert(rows);
      }
      
      await trx("watchlists").where({ id }).update({ updated_at: db.fn.now() });
    });
  }
}
