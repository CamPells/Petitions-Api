import {Request, Response} from "express";
import Logger from "../../config/logger";
import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'

const ajv = new Ajv({ removeAdditional: 'all', strict: false });

const addSupportTier = async (req: Request, res: Response): Promise<void> => {
    const validation = await validate(schemas.support_tier_post, req.body);
    if (validation !== true) {
        res.status(400).send(`Bad Request ${validation.toString()}`);
        return;
    }
    try {
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.status(400).send('Bad Request: Invalid petition ID');
            return;
        }

        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.status(401).send('Unauthorized: Missing authentication token');
            return;
        }

        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            res.status(401).send('Unauthorized: Invalid authentication token');
            return;
        }
        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.status(403).send('Forbidden: Only the owner of a petition may modify it');
            return;
        }

        const { title, description, cost } = req.body;

        if (!title || !description || !cost) {
            res.status(400).send('Bad Request: Missing required fields in the request body');
            return;
        }
        const dosePetitionExists = await petitions.petitionExists(petitionId);
        if (!dosePetitionExists) {
            res.status(404).send('Not Found: Petition not found');
            return;
        }
        const existingSupportTiers = await petitions.getSupportTiers(petitionId);
        if (existingSupportTiers.length >= 3) {
            res.status(403).send('Forbidden: Cannot add a support tier if 3 already exist');
            return;
        }
        const titleExistsInPetition = existingSupportTiers.some(tier => tier.title === title);
        if (titleExistsInPetition) {
            res.status(403).send('Forbidden: Support title not unique within petition');
            return;
        }
        await petitions.insertSupportTier(petitionId, title, description, cost);

        res.status(201).send('OK');
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
    }
};

const editSupportTier = async (req: Request, res: Response): Promise<void> => {
    const validation = await validate(schemas.support_tier_patch, req.body);
    if (validation !== true) {
        res.statusMessage = "Bad Request";
        res.status(400).send();
        return;
    }
    try {
        const petitionId = parseInt(req.params.id, 10);
        const tierId = parseInt(req.params.tierId, 10);
        if (isNaN(petitionId) || isNaN(tierId)) {
            res.statusMessage = "Bad Request: Invalid petition ID";
            res.status(400).send();
            return;
        }
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage ='Unauthorized: Missing authentication token'
            res.status(401).send();
            return;
        }
        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            res.statusMessage ='Unauthorized: Invalid authentication token'
            res.status(401).send();
            return;
        }
        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.statusMessage = 'Forbidden: Only the owner of a petition may modify it'
            res.status(403).send();
            return;
        }
        const supporterExists = await petitions.supporterExistsForTier(tierId);
        if (supporterExists) {
            res.statusMessage = 'Forbidden: Cannot edit a support tier if a supporter already exists for it'
            res.status(403).send();
            return;
        }
        const { title, description, cost } = req.body;
        if (!title && !description && !cost) {
            res.statusMessage = 'Bad Request: At least one field should be present for updating'
            res.status(400).send();
            return;
        }
        const doesPetitionExist = await petitions.petitionExists(petitionId);
        if (!doesPetitionExist) {
            res.statusMessage = 'Not Found: Petition not found'
            res.status(404).send();
            return;
        }
        const titleExistsInPetition = await petitions.titleExistsInPetition(petitionId, title);
        if (titleExistsInPetition) {
            res.statusMessage = 'Forbidden: Support title not unique within petition'
            res.status(403).send();
            return;
        }

        if (title) {
            await petitions.updateSupportTierTitle(tierId, title);
        }
        if (description) {
            await petitions.updateSupportTierDescription(tierId, description);
        }
        if (cost !== undefined) {
            await petitions.updateSupportTierCost(tierId, cost);
        }

        res.status(200).send('OK');
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
    }
};

const deleteSupportTier = async (req: Request, res: Response): Promise<void> => {
    try {
        const petitionId = parseInt(req.params.id, 10);
        const tierId = parseInt(req.params.tierId, 10);
        if (isNaN(petitionId) || isNaN(tierId)) {
            res.statusMessage = 'Bad Request: Invalid petition ID or support tier ID'
            res.status(400).send();
            return;
        }
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage ='Unauthorized: Missing authentication token'
            res.status(401).send();
            return;
        }
        const supportTierExists = await petitions.supportTierExists(tierId);
        if (!supportTierExists) {
            res.statusMessage = 'Not Found: Support tier does not exist'
            res.status(404).send();
            return;
        }

        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            res.statusMessage = 'Unauthorized: Invalid authentication token'
            res.status(401).send();
            return;
        }
        const supporterExists = await petitions.supporterExistsForTier(tierId);
        if (supporterExists) {
            res.statusMessage ='Forbidden: Cannot remove a support tier if a supporter already exists for it'
            res.status(403).send();
            return;
        }
        const supportTiers = await petitions.getSupportTiers(petitionId);
        if (supportTiers.length === 1) {
            res.statusMessage = 'Forbidden: Cannot remove the only support tier for a petition'
            res.status(404).send();
            return;
        }
        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.statusMessage = 'Forbidden: Only the owner of a petition may delete it'
            res.status(403).send();
            return;
        }
        await petitions.removeSupportTier(tierId);

        res.statusMessage = "OK"
        res.status(200).send();
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


export {addSupportTier, editSupportTier, deleteSupportTier};