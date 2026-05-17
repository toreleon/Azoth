import type { IpcChannelMap } from "../../shared/ipc.js";

export type Handler<K extends keyof IpcChannelMap> = (
  req: IpcChannelMap[K]["req"],
) => Promise<IpcChannelMap[K]["res"]> | IpcChannelMap[K]["res"];

export type IpcRegister = <K extends keyof IpcChannelMap>(channel: K, handler: Handler<K>) => void;
