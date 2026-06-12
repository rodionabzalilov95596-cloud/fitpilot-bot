export type MaxUpdate = {
  update_type: string;
  timestamp?: number;
  chat_id?: number;
  user?: { user_id?: number; name?: string };
  message?: {
    sender?: { user_id?: number };
    recipient?: { chat_id?: number };
    body?: { mid?: string; text?: string };
  };
  callback?: {
    callback_id?: string;
    payload?: string;
    user?: { user_id?: number };
    sender?: { user_id?: number };
  };
};

export type MaxUpdatesResponse = {
  updates?: MaxUpdate[];
  marker?: number | null;
};
