const authenticationToken = async (): Promise<string> => {
    return Math.random().toString(36) // Generate a random string
    // Resolve the promise with the generated token
};
export {authenticationToken};