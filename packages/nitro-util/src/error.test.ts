import 'mocha';
import { expect } from 'chai';
import { WrappedError } from './error';

const EXPECTED_NESTED_ERROR = 'WrappedError 3: WrappedError 2: WrappedError 1: Error 1';
describe('Test WrappedError', () => {
  it('Print nested error', () => {
    const err1 = new Error('Error 1');
    const wErr1 = new WrappedError('WrappedError 1', [err1]);
    const wErr2 = new WrappedError('WrappedError 2', [wErr1]);
    const wErr3 = new WrappedError('WrappedError 3', [wErr2]);
    expect(wErr3.message).to.be.equal(EXPECTED_NESTED_ERROR);
  });
});
