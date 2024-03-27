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
            res.status(404).send('Not Found. No user with specified ID, or user has no image');
            Logger.info('No image found for user with ID:', userId);
            return;
        }

        const imagePath = `${imageDirectory}${imageFilename}`;

        fs.readFile(imagePath, (err, data) => {
            if (err) {
                Logger.error(err);
                res.status(500).send("Internal Server Error");
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
        res.status(500).send("Internal Server Error");
    }
};





const setImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.status(401).send('Unauthorized');
            return;
        }
        const user = await users.getUserById(parseInt(userId, 10));
        if (!user) {
            res.status(404).send('Not found. No such user with the given ID');
            return;
        }
        if (authToken !== user.auth_token) {
            res.status(403).send('Can not edit another user\'s information');
            return;
        }
        const contentType = req.headers['content-type'];
        if (!contentType) {
            res.status(400).send('Bad Request. Missing content-type header');
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
            res.status(400).send('Bad Request. Unsupported image type');
            return;
        }

        const imagePath = `${imageDirectory}${userId}.${fileType}`;
        await fs.writeFile(imagePath, req.body, 'binary');


        const hasExistingPhoto = !!user.image_filename;
        await users.updateUserProfilePhoto(user.id, `${userId}.${fileType}`);


        const statusCode = hasExistingPhoto ? 200 : 201;
        res.status(statusCode).send('OK');

    } catch (err) {
        Logger.error(err);
        res.status(500).send('Internal Server Error');
    }
};

const deleteImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = req.params.id;
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.status(401).send('Unauthorized');
            return;
        }
        if (!/^\d+$/.test(userId)) {
            res.status(400).send('Bad Request. Invalid user ID');
            return;
        }

        const user = await users.getUserById(parseInt(userId, 10));
        if (!user) {
            res.status(404).send('Not Found. No user with specified ID, or user has no image');
            Logger.info(user);
            return;
        }
        if (authToken !== user.auth_token) {
            res.status(403).send('Forbidden. Cannot delete another user\'s profile photo');
            return;
        }

        if (!user.image_filename) {
            res.status(404).send("Not Found. No user with specified ID, or user has no image");
            return;
        }

        await users.updateUserProfilePhoto(user.id, null);

        res.status(200).send('OK');
    } catch (err) {
        Logger.error(err);
        res.status(500).send('Internal Server Error');
    }
};

export {getImage, setImage, deleteImage}