import { expect } from 'chai';
import { test } from '../src/browser';

describe('testFunction', () => {
  it('should return the expected result', () => {
    const result = test();
    expect(result).to.equal('test output');
  });
});
