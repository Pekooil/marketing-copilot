import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestContext {
  requestId: string;
  traceId: string;
  action?: string;
  workspaceHash?: string;
  actorHash?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

export function withRequestContext<T>(context: RequestContext, work: () => T) {
  return requestContext.run(context, work);
}

export function getRequestContext() {
  return requestContext.getStore();
}
