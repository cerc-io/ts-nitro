import _ from 'lodash';

export class WrappedError extends Error {
  errors: Error[] = [];

  constructor(message: string, errors: Error[]) {
    super(message);
    this.errors = errors;
  }

  static is(error: Error, targetError: Error) {
    if (_.isEqual(error, targetError)) {
      return true;
    }

    if (error instanceof WrappedError) {
      /* eslint-disable no-restricted-syntax */
      for (const err of error.errors) {
        if (WrappedError.is(err, targetError)) {
          return true;
        }
      }
    }

    return false;
  }
}
