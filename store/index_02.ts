import { JsonFileStore } from "./json/JsonFileStore_01.ts";
import type { Store } from "./Store_01.ts";

interface CreateStoreOptions {
  dataFilePath?: string;
}

// V2 對應 backend_02.ts / Store_01.ts / JsonFileStore_01.ts
export function createStore(options: CreateStoreOptions = {}): Store {
  return new JsonFileStore({
    dataFilePath: options.dataFilePath ?? "./data/store.json",
  });
}

export type { Store } from "./Store_01.ts";
