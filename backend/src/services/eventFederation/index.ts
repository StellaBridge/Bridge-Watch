/**
 * Public API for the event federation subsystem.
 *
 * Exports the singleton service and all public types.  Import this module
 * whenever you need to interact with the federation — do not import
 * EventFederationService.ts directly from outside this directory.
 */

export { EventFederationService, FEDERATION_EVENT, FEDERATION_HEALTH_EVENT } from "./EventFederationService.js";
export type {
  FederatedEvent,
  FederatedEventType,
  ChainId,
  SourceLiveness,
  SourceStatus,
  FederationHealth,
  FederationStatus,
  IChainConnector,
  ReplayRequest,
  SignedFederatedEvent,
  EventSubmissionResult,
} from "./types.js";

import { EventFederationService } from "./EventFederationService.js";

let _instance: EventFederationService | null = null;

export function getEventFederationService(): EventFederationService {
  if (!_instance) {
    _instance = new EventFederationService();
  }
  return _instance;
}

export function resetEventFederationService(): void {
  _instance = null;
}
