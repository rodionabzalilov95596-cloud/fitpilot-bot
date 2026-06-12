export type VkLongPollServer = {
  key: string;
  server: string;
  ts: string;
};

export type VkMessage = {
  id: number;
  from_id: number;
  peer_id: number;
  text?: string;
  payload?: string;
  out?: number;
};

export type VkLongPollUpdate = {
  type: string;
  object?: {
    message?: VkMessage;
    user_id?: number;
    client_info?: unknown;
  };
};

export type VkLongPollResponse = {
  ts?: string;
  updates?: VkLongPollUpdate[];
  failed?: number;
};
