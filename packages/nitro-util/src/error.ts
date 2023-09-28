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
      for (let i = 0; i < error.errors.length; i += 1) {
        if (WrappedError.is(error.errors[i], targetError)) {
          return true;
        }
      }
    }

    return false;
  }

  static printError(error: WrappedError | Error) {
    let errorMsg = 'Error';

    const printNestedError = (err: WrappedError | Error) => {
      errorMsg = `${errorMsg}: ${err.message}`;

      if (err instanceof WrappedError) {
        for (let i = 0; i < err.errors.length; i += 1) {
          printNestedError(err.errors[i]);
        }
      }

      return errorMsg;
    };

    printNestedError(error);
    return errorMsg;
  }
}
