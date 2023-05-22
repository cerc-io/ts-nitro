import { Engine } from './engine/engine';

export class Client {
  _engine: Engine;

  constructor () {
    this._engine = new Engine();
  }
}
