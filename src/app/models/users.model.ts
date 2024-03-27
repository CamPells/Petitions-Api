import {getPool} from "../../config/db";
import * as passwords from "../services/passwords";
const imageDirectory = './storage/images/';
const defaultPhotoDirectory = './storage/default/';


import {ResultSetHeader, RowDataPacket} from 'mysql2';
import Logger from '../../config/logger';



const insert = async (email: string, firstName: string, lastName: string, password: string): Promise<ResultSetHeader> => {
    Logger.info(`Creating new user... in the database`);
    const conn = await getPool().getConnection();
    const hashedPassword = await passwords.hash(password); // Assuming hashPassword is a function to hash passwords
    const query = 'insert into `user` (email, first_name, last_name, password) values (?, ?, ?, ?)';
    const [result] = await conn.query(query, [email, firstName, lastName, hashedPassword]);
    await conn.release();
    return result;
}

const loginUser = async (email: string, password: string): Promise<RowDataPacket> => {
    Logger.info(`trying to log in... the database`);
    const conn = await getPool().getConnection();
    const [rows] = await conn.query('SELECT * FROM `user` WHERE email = ?', [email]);
    await conn.release();
    return rows.length > 0 ? rows[0] : null;

}
const checkEmailExists = async (email: string): Promise<boolean> => {
    const conn = await getPool().getConnection();
    const [rows] = await conn.query('SELECT id FROM `user` WHERE email = ?', [email]);
    await conn.release();
    return rows.length > 0;
};

const updateUserTokenForLogin = async (userId: number, token: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET auth_token = ? WHERE id = ?';
    const parameters = [token, userId];
    await conn.query(query, parameters);
    await conn.release();
};
const updateUserTokenForLogout = async (authToken: string | string[]): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET auth_token = ? WHERE auth_token = ?';
    const parameters = [null, authToken];
    await conn.query(query, parameters);
    await conn.release();
};
const getUserById = async (userId: number): Promise<RowDataPacket | null> => {
        const conn = await getPool().getConnection();
        const [rows] = await conn.query('SELECT * FROM `user` WHERE id = ?', [userId]);
        await conn.release();
        return rows.length > 0 ? rows[0] : null;
}
const updateUserEmailById = async (userId: number, email: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET email = ? WHERE id = ?';
    const parameters = [email, userId];
    await conn.query(query, parameters);
    await conn.release();
};

const updateUserFirstNameById = async (userId: number, firstName: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET first_name = ? WHERE id = ?';
    const parameters = [firstName, userId];
    await conn.query(query, parameters);
    await conn.release();
};

const updateUserLastNameById = async (userId: number, lastName: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET last_name = ? WHERE id = ?';
    const parameters = [lastName, userId];
    await conn.query(query, parameters);
    await conn.release();
};

const updateUserPasswordById = async (userId: number, password: string): Promise<void> => {
    const hashedPassword = await passwords.hash(password);
    const conn = await getPool().getConnection();
    const query = 'UPDATE `user` SET password = ? WHERE id = ?';
    const parameters = [hashedPassword, userId];
    await conn.query(query, parameters);
    await conn.release();
};

async function getUserIdFromToken(authToken: string | string[]): Promise<number | null> {
    const conn = await getPool().getConnection();
    const [rows] = await conn.query('SELECT id FROM `user` WHERE auth_token = ?', [authToken]);
    await conn.release();
    return rows.length > 0 ? rows[0] : null;
};
const updateUserProfilePhoto = async (userId: number, filename: string): Promise<void> => {
        const conn = await getPool().getConnection();
        const query = 'UPDATE `user` SET image_filename = ? WHERE id = ?';
        const parameters = [filename, userId];
        await conn.query(query, parameters);
        await conn.release();
};
const getImageFilename = async (id: number): Promise<string> => {
    const query = 'SELECT `image_filename` FROM `user` WHERE id = ?';
    const rows = await getPool().query(query, [id]);
    return rows[0].length === 0 ? null : rows[0][0].image_filename;
}
const checkAuthToken = async (authToken: string | string[]): Promise<boolean> => {
    const conn = await getPool().getConnection();
    const query = 'SELECT COUNT(*) AS count FROM `user` WHERE auth_token = ?';
    const [rows] = await conn.query(query, [authToken]);
    conn.release();
    return rows[0].count === 1;
}





export {checkAuthToken,checkEmailExists,insert,loginUser,updateUserTokenForLogin,getImageFilename,
    updateUserTokenForLogout,getUserById,updateUserEmailById,
    updateUserFirstNameById,updateUserLastNameById,
    updateUserPasswordById,getUserIdFromToken,updateUserProfilePhoto,};