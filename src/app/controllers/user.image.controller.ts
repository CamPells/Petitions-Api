import {Request, Response} from "express";
import Logger from "../../config/logger";
import * as users from "../models/users.model";

import fs from "mz/fs";
import path from "node:path";
import {getImageFilename} from "../models/users.model";
const imageDirectory = './storage/images/';
const defaultPhotoDirectory = './storage/default/';




const getImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const imageFilename = await getImageFilename(parseInt(userId, 10));

        if (!imageFilename) {
            res.statusMessage = 'Not Found. No user with specified ID, or user has no image';
            res.status(404).send();
            Logger.info('No image found for user with ID:', userId);
            return;
        }

        const imagePath = `${imageDirectory}${imageFilename}`;

        fs.readFile(imagePath, (err, data) => {
            if (err) {
                Logger.error(err);
                res.statusMessage = 'Internal Server Error';
                res.status(500).send();
                return;
            }

            const fileType = imageFilename.split(".").pop()?.toLowerCase();
            let mimeType = "";

            switch (fileType) {
                case "png":
                    mimeType = "image/png";
                    break;
                case "jpeg":
                case "jpg":
                    mimeType = "image/jpeg";
                    break;
                case "gif":
                    mimeType = "image/gif";
                    break;
                default:
                    mimeType = "application/octet-stream";
            }

            res.setHeader("Content-Type", mimeType);
            res.send(data);
        });
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
};

const setImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage = 'Unauthorized';
            res.status(401).send();
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));
        if (!user) {
            res.statusMessage = 'Not found. No such user with the given ID';
            res.status(404).send();
            return;
        }
        if (authToken !== user.auth_token) {
            res.statusMessage = 'Forbidden. Can not edit another user\'s information';
            res.status(403).send();
            return;
        }
        const contentType = req.headers['content-type'];
        if (!contentType) {
            res.statusMessage = 'Bad Request. Missing content-type header';
            res.status(400).send();
            return;
        }
        let fileType = '';
        if (contentType.includes('image/png')) {
            fileType = 'png';
        } else if (contentType.includes('image/jpeg')) {
            fileType = 'jpeg';
        } else if (contentType.includes('image/gif')) {
            fileType = 'gif';
        } else {
            res.statusMessage = 'Bad Request. Unsupported image type';
            res.status(400).send();
            return;
        }

        const imagePath = `${imageDirectory}${userId}.${fileType}`;
        await fs.writeFile(imagePath, req.body, 'binary');

        const hasExistingPhoto = !!user.image_filename;
        await users.updateUserProfilePhoto(user.id, `${userId}.${fileType}`);

        const statusCode = hasExistingPhoto ? 200 : 201;
        res.statusMessage = 'OK';
        res.status(statusCode).send();

    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
};

const deleteImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage = 'Unauthorized';
            res.status(401).send();
            return;
        }
        if (!/^\d+$/.test(userId)) {
            res.statusMessage = 'Bad Request. Invalid user ID';
            res.status(400).send();
            return;
        }

        const user = await users.getUserById(parseInt(userId, 10));
        if (!user) {
            res.statusMessage = 'Not Found. No user with specified ID, or user has no image';
            res.status(404).send();
            Logger.info(user);
            return;
        }
        if (authToken !== user.auth_token) {
            res.statusMessage = 'Forbidden. Cannot delete another user\'s profile photo';
            res.status(403).send();
            return;
        }

        if (!user.image_filename) {
            res.statusMessage = 'Not Found. No user with specified ID, or user has no image';
            res.status(404).send();
            return;
        }

        await users.updateUserProfilePhoto(user.id, null);

        res.statusMessage = 'OK';
        res.status(200).send();
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
};

export {getImage, setImage, deleteImage}