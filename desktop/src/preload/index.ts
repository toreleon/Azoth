import { contextBridge, ipcRenderer } from "electron";
import { STREAM_CHANNEL, type IpcChannel, type IpcChannelMap, type StreamEvent } from "../shared/ipc.js";

const api = {
  invoke: <K extends IpcChannel>(
    channel: K,
    req: IpcChannelMap[K]["req"],
  ): Promise<IpcChannelMap[K]["res"]> => {
    return ipcRenderer.invoke(channel, req) as Promise<IpcChannelMap[K]["res"]>;
  },
  on: (handler: (event: StreamEvent) => void): (() => void) => {
    const listener = (_: unknown, event: StreamEvent) => handler(event);
    ipcRenderer.on(STREAM_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(STREAM_CHANNEL, listener);
    };
  },
};

contextBridge.exposeInMainWorld("azoth", api);

export type AzothApi = typeof api;
