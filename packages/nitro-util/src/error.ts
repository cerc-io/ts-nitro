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
      if (error.errors.includes(targetError)) {
        return true;
      }

      return false;
    }

    return false;
  }
}
