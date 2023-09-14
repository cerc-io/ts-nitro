import { ObjectiveId } from '../../protocols/messages';

const CHANNEL_ID_LOG_KEY = 'channel-id';
const OBJECTIVE_ID_LOG_KEY = 'objective-id';
const ADDRESS_LOG_KEY = 'address';

// WithObjectiveIdAttribute returns a logging attribute for the given objective id
export function withObjectiveIdAttribute(o: ObjectiveId): { [key: string]: string } {
  return {
    [OBJECTIVE_ID_LOG_KEY]: o,
  };
}
