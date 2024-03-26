
import {Request, Response} from "express";
import Logger from "../../config/logger";
import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'

const ajv = new Ajv({ removeAdditional: 'all', strict: false });

const getAllSupportersForPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.status(400).send('Bad Request: Invalid petition ID');
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
        const validation = await validate(schemas.support_post, req.body);
        if (validation !== true) {
            res.status(400).send(`Bad Request: ${validation.toString()}`);
            return;
        }
        const authToken = req.headers['x-authorization'];
        const petitionId = parseInt(req.params.id, 10);
        const userId = await petitions.getUserIdFromAuthToken(authToken)
        if (isNaN(petitionId)) {
            res.status(400).send('Bad Request: Invalid petition ID');
            return;
        }

        const isOwner = await petitions.isUserOwnerOfPetition(userId, petitionId);
        if (isOwner) {
            res.status(403).send('Forbidden: Cannot support your own petition');
            return;
        }


        // Check if the petition exists
        const petitionExists = await petitions.petitionExists(petitionId);
        if (!petitionExists) {
            res.status(404).send(`Not Found: No petition found with id ${petitionId}`);
            return;
        }

        const message = req.body.message;

        // Get the support tier ID for the given petition and user
        const supportTierId = await petitions.getSupportTierId(petitionId, userId);
        if (supportTierId === null) {
            res.status(404).send(`Not Found: No support tier found for the given petition and user`);
            return;
        }

        // Call function to add supporter to the database
        await petitions.addSupporterToDb(petitionId, supportTierId, message);

        // Return success response
        res.status(201).send('Created');
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