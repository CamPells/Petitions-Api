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
            res.status(400).send(`Bad Request ${validation.toString()}`);
            return;
        }
        const { email, firstName, lastName, password } = req.body;
        if (!isValidEmail(email)) {
            res.status(400).send('Bad Request');
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
    try{
        const {email, password} = req.body
        if (!email || !password) {
            res.status(400).send('Bad Request invalid information');
            return;
        }
        const validation = await validate(schemas.user_login, req.body);
        if (validation !== true) {
            res.status(400).send(`Bad Request ${validation.toString()}`);
            return;
        }
        const user = await users.loginUser(email, req.body);
        const id = user.id;
        logger.info(user);
        if (!user) {
            res.status(400).send('User not found');
            return;

        }
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            res.status(401).send('UnAuthorized. Incorrect email/password');
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
}

const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const authToken = req.headers['x-authorization'];

        if (!authToken) {
            res.status(401).send('Unauthorized. Cannot log out if you are not authenticated');
            return;
        }

        // Update user's authentication token to null based on authToken
        await users.updateUserTokenForLogout(authToken);

        res.status(200).send('Logged out successfully');
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
            res.status(400).send('Bad Request. Invalid user ID');
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));

        if (!user) {
            res.status(404).send('Not Found. No user with specified ID');
            logger.info(user);
            return;
        }
        if (authToken === user.auth_token) {
            res.status(200).json({
                'email': user.email,
                'firstName': user.first_name,
                'lastName': user.last_name
            });
            logger.info(user)
        } else {
            // Otherwise, return only first and last names
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
            res.status(401).send('Unauthorized or Invalid currentPassword');
            return;
        }

        if (!/^\d+$/.test(userId)) {
            res.status(400).send('Bad Request. Invalid information');
            return;
        }
        const validation = await validate(schemas.user_edit, req.body);
        if (validation !== true) {
            res.status(400).send(`Bad Request ${validation.toString()}`);
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));
        if (authToken !== user.auth_token) {
            res.status(403).send('Can not edit another user\'s information');
            return;
        }
        if (!user) {
            res.status(404).send('Not Found. No user with specified ID');
            logger.info(user);
            return;
        }

        const { email, firstName, lastName, password, currentPassword } = req.body;
        if (!isValidEmail(user.email)) { // Using email validator
            res.status(400).send('Bad Request');
            return;
        }

        if (password && currentPassword) {
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) {
                res.status(401).send('Incorrect password');
            }
            if (password === currentPassword) {
                res.status(403).send('Forbidden. Current password and new password must not be the same');
                return;
            }
            if (password.length < 6) {
                res.status(400).send('Bad Request. Password must be at least 6 characters');
                return;
            }
        }
        try {
            if (email) {
                if (!isValidEmail(email)) { // Using email validator
                    res.status(400).send('Bad Request');
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

            // Send success response
            res.status(200).send('OK');
        } catch (err) {
            if (err.code === "ER_DUP_ENTRY") {
                res.statusMessage = 'Email is already in use';
                res.status(403).send('Forbidden. Email already exists');
            } else {
                Logger.error(err);
                res.statusMessage = "Internal Server Error";
                res.status(500).send()
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