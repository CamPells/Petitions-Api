import {Request, Response} from "express";
import Logger from "../../config/logger";
import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'
import * as users from '../models/users.model'
import fs from "mz/fs";
const imageDirectory = './storage/images/';
const defaultPhotoDirectory = './storage/default/';

const getImage = async (req: Request, res: Response): Promise<void> => {
    try {
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.statusMessage = "Id must be an integer";
            res.status(400).send();
            return;
        }

        const filename = await petitions.getImageFilename(petitionId);
        if (filename === null) {
            res.status(404).send();
            return;
        }

        const imagePath = `${imageDirectory}${filename}`;

        fs.readFile(imagePath, (err, data) => {
            if (err) {
                Logger.error(err);
                res.status(500).send("Internal Server Error");
                return;
            }

            const fileType = filename.split(".").pop()?.toLowerCase();
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
                    mimeType = "application/octet-stream"; // fallback MIME type
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
        const petitionId = parseInt(req.params.id, 10);
        const authToken = req.headers['x-authorization'];
        const userId = await petitions.getUserIdFromAuthToken(authToken);

        // Check if the user is authenticated
        if (!authToken) {
            res.status(401).send('Unauthorized');
            return;
        }

        // Check if the petition exists
        const petition = await petitions.getOne(petitionId);
        if (!petition) {
            res.status(404).send('Not found. No such petition with the given ID');
            return;
        }

        // Check if the user is the owner of the petition
        if (petition.ownerId !== userId) {
            res.status(403).send('Forbidden. Cannot edit another user\'s petition');
            return;
        }

        // Check if the request contains the content-type header
        const contentType = req.headers['content-type'];
        if (!contentType) {
            res.status(400).send('Bad Request. Missing content-type header');
            return;
        }

        let fileType = '';
        // Determine the file type based on the content type
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

        // Generate the image path
        const imagePath = `${imageDirectory}${petitionId}.${fileType}`;

        // Write the image data to the file
        await fs.promises.writeFile(imagePath, req.body, 'binary');

        // Update the petition's hero image filename
        await petitions.updatePetitionsHeroPic(petitionId, `${petitionId}.${fileType}`);
        const hasExistingPhoto = !!petition.image_filename;

        // Determine the response status code based on whether the petition already had a hero image
        const statusCode = hasExistingPhoto ? 200 : 201;
        res.status(statusCode).send('OK');

    } catch (err) {
        Logger.error(err);
        res.status(500).send('Internal Server Error');
    }
};


export {getImage, setImage};