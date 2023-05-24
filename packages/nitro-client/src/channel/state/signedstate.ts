import { Signature } from '../../crypto/signatures';
import { State } from './state';

// TODO: Implement
export class SignedState {
  state: State;

  // TODO: uint replacement
  sigs: Map<number, Signature>; // keyed by participant index

  constructor(s: State) {
    this.state = s;
    // TODO: Map size?
    this.sigs = new Map();
  }
}
