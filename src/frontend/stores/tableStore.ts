import { create } from "zustand";
import { persist } from "zustand/middleware";

interface TableStore {
  lastPickedTableId: string | null;
  setLastPickedTableId: (id: string | null) => void;
}

const STORAGE_KEY = "foosball-table-store";

export const useTableStore = create<TableStore>()(
  persist(
    (set) => ({
      lastPickedTableId: null,
      setLastPickedTableId: (id: string | null) =>
        set({ lastPickedTableId: id }),
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);
