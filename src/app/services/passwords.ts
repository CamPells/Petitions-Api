
import bcrypt from 'bcrypt';

const saltRounds = 10; // Number of salt rounds for bcrypt

const hash = async (password: string): Promise<string> => {
    // Hash the password using bcrypt
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    return hashedPassword;
}

const compare = async (password: string, hashedPassword: string): Promise<boolean> => {
    // Compare the password with the hashed password using bcrypt
    const match = await bcrypt.compare(password, hashedPassword);
    return match;
}

export { hash, compare };