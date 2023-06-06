// Map wraps sync.Map in order to provide type safety. The supplied type parameter T applies to the values in the map (not the keys).
export class SafeSyncMap<T> {
  // TODO: Implement Go sync.Map
  private m: Map<string, T> = new Map();

  // load returns the value stored in the map for a key, or nil if no
  // value is present.
  // The ok result indicates whether value was found in the map.
  load(id: string): [T | undefined, boolean] {
    const value = this.m.get(id);
    if (value === undefined) {
      return [undefined, false];
    }
    return [value, true];
  }

  // Store sets the value for a key.
  store(key: string, data: T) {
    this.m.set(key, data);
  }

  // Delete deletes the value for a key.
  delete(key: string) {
    this.m.delete(key);
  }

  // Range calls f sequentially for each key and value present in the map.
  // If f returns false, range stops the iteration.
  //
  // Range does not necessarily correspond to any consistent snapshot of the Map's
  // contents: no key will be visited more than once, but if the value for any key
  // is stored or deleted concurrently, Range may reflect any mapping for that key
  // from any point during the Range call.
  //
  // Range may be O(N) with the number of elements in the map even if f returns
  // false after a constant number of calls.
  range(f: (key: string, value: T) => boolean): void {
    for (const [key, value] of this.m) {
      if (!f(key, value)) {
        break;
      }
    }
  }

  // LoadOrStore returns the existing value for the key if present.
  // Otherwise, it stores and returns the given value.
  // The loaded result is true if the value was loaded, false if stored.
  loadOrStore(key: string, value: T): [T, boolean] {
    if (this.m.has(key)) {
      return [this.m.get(key)!, true];
    }
    this.m.set(key, value);
    return [value, false];
  }
}
