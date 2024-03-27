import {Request, Response} from "express";
import Logger from '../../config/logger';
import * as users from '../models/users.model'
import {getUserById, insert, updateUserTokenForLogin} from "../models/users.model";
import { isValidEmail } from '../services/emailverify';

import Ajv from 'ajv';
import * as schemas from '../resources/schemas.json'
import logger from "../../config/logger";
import bcrypt, {hash} from "bcrypt";
import {authenticationToken} from '../services/autherise';

const ajv = new Ajv({ removeAdditional: 'all', strict: false });
const register = async (req: Request, res: Response): Promise<void> => {
    Logger.http("post register user");
    try {
        const validation = await validate(schemas.user_register, req.body);
        if (validation !== true) {
            res.statusMessage = 'Bad Request. Invalid information';
            res.status(400).send();
            return;
        }
        const { email, firstName, lastName, password } = req.body;
        if (!isValidEmail(email)) {
            res.statusMessage = 'Bad Request';
            res.status(400).send();
            return;
        }
        try {
            const result = await users.insert(email, firstName, lastName, password);
            const id = result.insertId;
            logger.info(result);
            res.status(201).send({ 'userId': id });
        } catch (err) {
            logger.error(err);
            res.statusMessage = "email already in use";
            res.status(403).send();
            return;
        }
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
        return;
    }
};

const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            res.statusMessage = 'Bad Request. Invalid information';
            res.status(400).send();
            return;
        }
        if (!isValidEmail(email)) {
            res.statusMessage = 'Bad Request. Invalid email format';
            res.status(400).send();
            return;
        }
        const emailExists = await users.checkEmailExists(email);
        if (!emailExists) {
            res.statusMessage = 'Email dose not exist';
            res.status(401).send();
            return;
        }
        const validation = await validate(schemas.user_login, req.body);
        if (validation !== true) {
            res.statusMessage = `Bad Request ${validation.toString()}`;
            res.status(400).send();
            return;
        }
        const user = await users.loginUser(email, req.body);
        const id = user.id;
        logger.info(user);
        if (!user) {
            res.statusMessage = 'Bad Request. User not found';
            res.status(400).send();
            return;
        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            res.statusMessage = 'Unauthorized. Incorrect email/password';
            res.status(401).send();
            return;
        }
        const token = await authenticationToken();
        await users.updateUserTokenForLogin(user.id, token);
        res.status(200).send({
            'userId': user.id,
            'token': token
        });
        return;
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
        return;
    }
};

const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const authToken = req.headers['x-authorization'];

        if (!authToken) {
            res.statusMessage = 'Unauthorized. Cannot log out if you are not authenticated';
            res.status(401).send();
            return;
        }
        const authTokenMatch = await users.checkAuthToken(authToken);
        if(!authTokenMatch) {
            res.statusMessage = 'Unauthorized. Cannot log out if you are not authenticated';
            res.status(401).send()
            return
        }

        await users.updateUserTokenForLogout(authToken);
        res.statusMessage = 'Logged out successfully'
        res.status(200).send();
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
}

const view = async (req: Request, res: Response): Promise<void> => {
    try {
        const authToken = req.headers['x-authorization'];
        const userId = req.params.id;

        if (!/^\d+$/.test(userId)) {
            res.statusMessage = 'Bad Request. Invalid user ID';
            res.status(400).send();
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));

        if (!user) {
            res.statusMessage = 'Not Found. No user with specified ID';
            res.status(404).send();
            logger.info(user);
            return;
        }
        if (authToken === user.auth_token) {
            res.status(200).json({
                'email': user.email,
                'firstName': user.first_name,
                'lastName': user.last_name
            });
            logger.info(user);
        } else {
            res.status(200).json({
                'firstName': user.first_name,
                'lastName': user.last_name
            });
        }
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
};

const update = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage = 'Unauthorized or Invalid currentPassword';
            res.status(401).send();
            return;
        }

        if (!/^\d+$/.test(userId)) {
            res.statusMessage = 'Bad Request. Invalid information';
            res.status(400).send();
            return;
        }
        const validation = await validate(schemas.user_edit, req.body);
        if (validation !== true) {
            res.statusMessage = `Bad Request ${validation.toString()}`;
            res.status(400).send();
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));
        if (!user) {
            res.statusMessage = 'Not Found. No user with specified ID';
            res.status(404).send();
            logger.info(user);
            return;
        }
        if (authToken !== user.auth_token) {
            res.statusMessage = 'Forbidden. Cannot edit another user\'s information';
            res.status(403).send();
            return;
        }

        const { email, firstName, lastName, password, currentPassword } = req.body;
        if (!isValidEmail(user.email)) { // Using email validator
            res.statusMessage = 'Bad Request';
            res.status(400).send();
            return;
        }

        if (password && currentPassword) {
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) {
                res.statusMessage = 'Incorrect password';
                res.status(401).send();
                return;
            }
            if (password === currentPassword) {
                res.statusMessage = 'Forbidden. Current password and new password must not be the same';
                res.status(403).send();
                return;
            }
            if (password.length < 6) {
                res.statusMessage = 'Bad Request. Password must be at least 6 characters';
                res.status(400).send();
                return;
            }
        }
        try {
            if (email) {
                if (!isValidEmail(email)) {
                    res.statusMessage = 'Bad Request';
                    res.status(400).send();
                    return;
                }
                await users.updateUserEmailById(user.id, email);
            }
            if (firstName) {
                await users.updateUserFirstNameById(user.id, firstName);
            }
            if (lastName) {
                await users.updateUserLastNameById(user.id, lastName);
            }
            if (password) {
                await users.updateUserPasswordById(user.id, password);
            }

            res.statusMessage = 'OK'
            res.status(200).send();
        } catch (err) {
            if (err.code === "ER_DUP_ENTRY") {
                res.statusMessage = 'Email is already in use';
                res.status(403).send();
            } else {
                Logger.error(err);
                res.statusMessage = "Internal Server Error";
                res.status(500).send();
            }
        }
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
    }
};
const validate = async (schema: object, data: any) => {
    try {
        const validator = ajv.compile(schema);
        const valid = await validator(data);
        if (!valid)
            return ajv.errorsText(validator.errors);
        return true;
    } catch (err) {
        return err.message;
    }
};

export {register, login, logout, view, update}