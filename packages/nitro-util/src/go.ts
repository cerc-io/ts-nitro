// Placeholder function for go routines
// TODO: Implement necessary thread execution
export const go = async (func: () => void | Promise<void>) => {
  await func();
};
