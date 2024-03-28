
import {Request, Response} from "express";
import Logger from "../../config/logger";
import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'
import {getSupportTierId} from "../models/petitions.model";

const ajv = new Ajv({ removeAdditional: 'all', strict: false });

const getAllSupportersForPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.statusMessage = 'Bad Request: Invalid petition ID'
            res.status(400).send();
            return;
        }

        const supporters = await petitions.getSupportersFromDatabase(petitionId);

        res.status(200).json(supporters);
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
    }
};
const addSupporter = async (req: Request, res: Response): Promise<void> => {
    try {
        // Validate request body
        const validation = await validate(schemas.support_post, req.body);
        if (validation !== true) {
            res.statusMessage = `Bad Request:`
            res.status(400).send();
            return;
        }
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage = 'Unauthorized: Missing authentication token'
            res.status(401).send();
            return;
        }

        const petitionId = parseInt(req.params.id, 10);
        const userId = await petitions.getUserIdFromAuthToken(authToken);
        const supportTierId = req.body.supportTierId;
        const message = req.body.message;



        if (isNaN(petitionId) || isNaN(supportTierId)) {
            res.statusMessage = 'Bad Request: Invalid petition ID or support tier ID'
            res.status(400).send();
            return;
        }

        const isOwner = await petitions.isUserOwnerOfPetition(userId, petitionId);
        if (isOwner) {
            res.statusMessage = 'Forbidden: Cannot support your own petition'
            res.status(403).send();
            return;
        }
        const alreadySupported = await petitions.hasUserSupportedTier(userId, petitionId, supportTierId);
        if (alreadySupported) {
            res.statusMessage = 'Forbidden: User has already supported the petition at this tier'
            res.status(403).send();
            return;
        }
        const supportTierExists = await petitions.supportTierExists(supportTierId);
        if (!supportTierExists) {
            res.statusMessage = `Not Found: No support tier found with id `
            res.status(404).send();
            return;
        }

        const petitionExists = await petitions.petitionExists(petitionId);
        if (!petitionExists) {
            res.statusMessage =`Not Found: No petition found with id `
            res.status(404).send();
            return;
        }

        await petitions.addSupporterToDb(petitionId, userId, supportTierId, message);
        res.statusMessage = "Created"

        res.status(201).send();
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
        return;
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

export {getAllSupportersForPetition, addSupporter}