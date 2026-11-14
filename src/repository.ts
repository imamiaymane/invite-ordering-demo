import { initialData, type Demo } from "./model";

/** Replace this boundary with SharePoint services after the design is approved. */
export interface DemoRepository {
  load(): Demo;
  save(data: Demo): void;
}

export const localRepository: DemoRepository = {
  load() {
    try {
      const raw = localStorage.getItem("invite-demo-v4");
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data.requests) && Array.isArray(data.parcels))
          return data;
      }
    } catch {
      /* A clean demo is usable when browser storage is unavailable. */
    }
    return initialData();
  },
  save(data) {
    localStorage.setItem("invite-demo-v4", JSON.stringify(data));
  },
};
