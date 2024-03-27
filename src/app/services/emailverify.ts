const emailRegex: RegExp = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[a-zA-Z]*$/;

const isValidEmail = (email: string): boolean => {
    return emailRegex.test(email);
};

export { isValidEmail };
