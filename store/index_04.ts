import { JsonFileStore } from "./json/JsonFileStore_05.ts";
import type { Store } from "./Store_02.ts";

interface CreateStoreOptions {
  dataFilePath?: string;
}

// V4 的 store 在講義中包含 JsonFileStore_03.ts / _04.ts / _05.ts 三個修正版。
// 這個入口預設指向 V4 最後收斂的 JsonFileStore_05.ts。
export function createStore(options: CreateStoreOptions = {}): Store {
  return new JsonFileStore({
    dataFilePath: options.dataFilePath ?? "./data/store.json",
  });
}

export type { Store } from "./Store_02.ts";
