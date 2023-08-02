import debug from 'debug';

const log = debug('ts-nitro:util:go');

// Placeholder function for go routines
// TODO: Avoid any type with method overloading
export const go = async (func: (...args: any[]) => void | Promise<void>, ...params: any[]) => {
  try {
    await func(...params);
  } catch (err) {
    log(err);
    throw err;
  }
};
