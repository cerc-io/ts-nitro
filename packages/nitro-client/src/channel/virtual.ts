import { FieldDescription, fromJSON, toJSON } from '@cerc-io/nitro-util';

import { Channel } from './channel';
import { State } from './state/state';

export class VirtualChannel extends Channel {
  static jsonEncodingMap: Record<string, FieldDescription> = {
    ...super.jsonEncodingMap,
  };

  static fromJSON(data: string): VirtualChannel {
    const props = fromJSON(this.jsonEncodingMap, data);
    return new VirtualChannel(props);
  }

  toJSON(): any {
    return toJSON(VirtualChannel.jsonEncodingMap, this);
  }

  // NewVirtualChannel returns a new VirtualChannel based on the supplied state.
  //
  // Virtual channel protocol currently presumes exactly two "active" participants,
  // Alice and Bob (p[0] and p[last]). They should be the only destinations allocated
  // to in the supplied state's Outcome.
  static newVirtualChannel(s: State, myIndex: number): VirtualChannel {
    if (myIndex >= s.participants.length) {
      throw new Error('myIndex not in range of the supplied participants');
    }

    for (const assetExit of s.outcome.value) {
      if (assetExit.allocations.value.length !== 2) {
        throw new Error("a virtual channel's initial state should only have two allocations");
      }
    }

    const c = Channel.new(s, myIndex);

    return new VirtualChannel({ ...c });
  }

  clone(): VirtualChannel {
    // TODO: Handle case
    // if v == nil {
    //   return nil
    // }

    const w = new VirtualChannel({ ...super.clone() });
    return w;
  }
}
