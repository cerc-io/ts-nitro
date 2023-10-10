import { ObjectiveId } from '../../protocols/messages';

const OBJECTIVE_ID_LOG_KEY = 'objective-id';

// WithObjectiveIdAttribute returns a logging attribute for the given objective id
export function withObjectiveIdAttribute(o: ObjectiveId): { [key: string]: string } {
  return {
    [OBJECTIVE_ID_LOG_KEY]: o,
  };
}
