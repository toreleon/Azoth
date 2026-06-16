import type { IpcChannel, IpcChannelMap, StreamEvent } from "../shared/ipc.js";

declare global {
  interface Window {
    azoth: {
      invoke<K extends IpcChannel>(
        channel: K,
        req: IpcChannelMap[K]["req"],
      ): Promise<IpcChannelMap[K]["res"]>;
      on(handler: (event: StreamEvent) => void): () => void;
    };
  }
}

export {};
