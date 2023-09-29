import _ from 'lodash';

export class WrappedError extends Error {
  errors: Error[] = [];

  constructor(message: string, errors: Error[]) {
    super(`${message}: ${errors[0].message}`);
    this.errors = errors;
  }

  static is(error: Error, targetError: Error) {
    if (_.isEqual(error, targetError)) {
      return true;
    }

    if (error instanceof WrappedError) {
      for (let i = 0; i < error.errors.length; i += 1) {
        if (WrappedError.is(error.errors[i], targetError)) {
          return true;
        }
      }
    }

    return false;
  }
}
