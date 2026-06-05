import { JsonFileStore } from "./json/JsonFileStore_02.ts";
import type { Store } from "./Store_02.ts";

interface CreateStoreOptions {
  dataFilePath?: string;
}

// V3 對應 backend_03.ts / Store_02.ts / JsonFileStore_02.ts
export function createStore(options: CreateStoreOptions = {}): Store {
  return new JsonFileStore({
    dataFilePath: options.dataFilePath ?? "./data/store.json",
  });
}

export type { Store } from "./Store_02.ts";
