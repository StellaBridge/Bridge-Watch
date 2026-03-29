import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { Watchlist } from "../types/watchlist";

const WATCHLIST_STORAGE_KEY = "bridgewatch_watchlists";
const CLIENT_ID_KEY = "bridgewatch_client_id";

function getClientId(): string {
  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    clientId = uuidv4();
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

// Local Storage Fallback Functions
function getLocalWatchlists(): Watchlist[] {
  try {
    const data = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (data) {
      return JSON.parse(data) as Watchlist[];
    }
  } catch (err) {
    console.error("Failed to parse local watchlists", err);
  }
  return [];
}

function setLocalWatchlists(lists: Watchlist[]) {
  localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(lists));
}

// Since the DB is currently inaccessible, we will only use the localStorage fallback for persistence
export function useWatchlist() {
  const queryClient = useQueryClient();
  const clientId = getClientId();

  // Queries
  const { data: watchlists = [], isLoading } = useQuery({
    queryKey: ["watchlists", clientId],
    queryFn: async (): Promise<Watchlist[]> => {
      const lists = getLocalWatchlists();
      if (lists.length === 0) {
        // Create an initial default watchlist if none exist
        const defaultList: Watchlist = {
          id: uuidv4(),
          name: "My Watchlist",
          isDefault: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assets: ["XLM", "USDC"],
        };
        setLocalWatchlists([defaultList]);
        return [defaultList];
      }
      return lists;
    },
  });

  const activeWatchlist = watchlists.find(w => w.isDefault) || watchlists[0];

  // Mutations
  const createWatchlist = useMutation({
    mutationFn: async ({ name, isDefault = false }: { name: string; isDefault?: boolean }) => {
      const lists = [...getLocalWatchlists()];
      if (isDefault) {
        lists.forEach(w => w.isDefault = false);
      }
      const newList: Watchlist = {
        id: uuidv4(),
        name,
        isDefault,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assets: [],
      };
      lists.push(newList);
      setLocalWatchlists(lists);
      return newList;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const renameWatchlist = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const lists = getLocalWatchlists();
      const list = lists.find(w => w.id === id);
      if (list) {
        list.name = name;
        list.updatedAt = new Date().toISOString();
        setLocalWatchlists(lists);
      }
      return list;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const setDefaultWatchlist = useMutation({
    mutationFn: async (id: string) => {
      const lists = getLocalWatchlists();
      lists.forEach(w => {
        w.isDefault = w.id === id;
      });
      setLocalWatchlists(lists);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const deleteWatchlist = useMutation({
    mutationFn: async (id: string) => {
      const lists = getLocalWatchlists().filter(w => w.id !== id);
      // Ensure there's a default
      if (lists.length > 0 && !lists.some(w => w.isDefault)) {
        lists[0].isDefault = true;
      }
      setLocalWatchlists(lists);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const addAsset = useMutation({
    mutationFn: async ({ watchlistId, symbol }: { watchlistId: string; symbol: string }) => {
      const lists = getLocalWatchlists();
      const list = lists.find(w => w.id === watchlistId);
      if (list && !list.assets.includes(symbol)) {
        list.assets.push(symbol);
        list.updatedAt = new Date().toISOString();
        setLocalWatchlists(lists);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const removeAsset = useMutation({
    mutationFn: async ({ watchlistId, symbol }: { watchlistId: string; symbol: string }) => {
      const lists = getLocalWatchlists();
      const list = lists.find(w => w.id === watchlistId);
      if (list) {
        list.assets = list.assets.filter(a => a !== symbol);
        list.updatedAt = new Date().toISOString();
        setLocalWatchlists(lists);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const updateAssetOrder = useMutation({
    mutationFn: async ({ watchlistId, assets }: { watchlistId: string; assets: string[] }) => {
      const lists = getLocalWatchlists();
      const list = lists.find(w => w.id === watchlistId);
      if (list) {
        list.assets = assets;
        list.updatedAt = new Date().toISOString();
        setLocalWatchlists(lists);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  const importWatchlists = useMutation({
    mutationFn: async (dataJson: string) => {
      try {
        const parsed = JSON.parse(dataJson) as Watchlist[];
        // Merge or replace
        const existing = getLocalWatchlists();
        const merged = [...existing];
        parsed.forEach(p => {
          if (!merged.some(e => e.id === p.id)) {
            // ensure any imported lists are not default to avoid conflict, only one default
            p.isDefault = false;
            merged.push(p);
          }
        });
        setLocalWatchlists(merged);
      } catch (err) {
        throw new Error("Invalid JSON format");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlists"] });
    },
  });

  return {
    watchlists,
    activeWatchlist,
    isLoading,
    createWatchlist,
    renameWatchlist,
    setDefaultWatchlist,
    deleteWatchlist,
    addAsset,
    removeAsset,
    updateAssetOrder,
    importWatchlists,
  };
}
