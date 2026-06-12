import { getInitialState } from '../scenarios/state.js';
import { parseBotCommand } from '../scenarios/workSchedule.js';
import type { IncomingMessage, LlmClient, OutgoingMessage, UserStore } from './types.js';
import { runScenarioTurn } from '../scenarios/engine.js';

export async function handleIncoming(args: {
  incoming: IncomingMessage;
  store: UserStore;
  llm: LlmClient;
}): Promise<{ outgoing: OutgoingMessage; debug: { stepId: string } }> {
  const { incoming, store, llm } = args;

  const restart = incoming.restart || parseBotCommand(incoming.text) === 'start';
  const prev = restart ? getInitialState() : (await store.get(incoming.userId)) ?? getInitialState();
  const { nextState, outgoing } = await runScenarioTurn({ state: prev, incoming, llm });
  await store.set(incoming.userId, nextState);

  return { outgoing, debug: { stepId: nextState.stepId } };
}

