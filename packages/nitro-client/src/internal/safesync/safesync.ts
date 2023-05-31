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
}
