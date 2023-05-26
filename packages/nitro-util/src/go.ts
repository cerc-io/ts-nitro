// Placeholder function for go routines
// TODO: Implement necessary thread execution
export const go = async (func: () => void | Promise<void>) => {
  try {
    await func();
  } catch (err) {
    console.log(err);
  }
};
