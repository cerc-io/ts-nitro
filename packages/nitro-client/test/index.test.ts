import { expect } from 'chai';
import { test } from '../src/index';

describe('testFunction', () => {
  it('should return the expected result', () => {
    const result = test();
    expect(result).to.equal('test output');
  });
});
