import { Channel } from './channel';
import { State } from './state/state';

// TODO: Implement
export class VirtualChannel extends Channel {
  // NewVirtualChannel returns a new VirtualChannel based on the supplied state.
  //
  // Virtual channel protocol currently presumes exactly two "active" participants,
  // Alice and Bob (p[0] and p[last]). They should be the only destinations allocated
  // to in the supplied state's Outcome.
  // TODO: Implement
  static newVirtualChannel(s: State, myIndex: number): VirtualChannel {
    return new VirtualChannel({});
  }
}
