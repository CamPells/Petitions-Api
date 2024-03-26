import {query, Request, Response} from "express";
import Logger from '../../config/logger';

import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'
const ajv = new Ajv({ removeAdditional: 'all', strict: false });
const getAllPetitions = async (req: Request, res: Response): Promise<void> => {
    const validation = await validate(schemas.petition_search, req.query);
    if (validation !== true) {
        res.status(400).send(`Bad Request ${validation.toString()}`);
        return;
    }
    try {
        const categoryIds = req.query.categoryIds as string[];
        const supportingCost = req.query.supportingCost as string;
        const startIndex = req.query.startIndex as string;
        const count = req.query.count as string;
        const q = req.query.q as string;
        const ownerId = req.query.ownerId as string;
        const supporterId = req.query.supporterId as string;
        const sortBy = req.query.sortBy as string;

        if (supporterId && isNaN(Number(supporterId))) {
            res.status(400).send('Bad Request: supporterId must be a number');
            return;
        }

        const mainQuery = 'SELECT p.id AS petitionId, p.title AS title, p.category_id AS categoryId, p.owner_id AS ownerId, ' +
            'u.first_name AS ownerFirstName, u.last_name AS ownerLastName, ' +
            'p.creation_date as creationDate, MIN(st.cost) as supportingCost, ' +
            '(SELECT COUNT(*) FROM supporter WHERE petition_id = p.id) AS numberOfSupporters ' +
            'FROM petition p JOIN user u ON p.owner_id = u.id ' +
            'LEFT JOIN supporter s ON p.id = s.petition_id ' +
            'JOIN support_tier st ON p.id = st.petition_id '

        let userParamString = 'WHERE 1=1';
        Logger.info('blah blahblah')


        if (q !== undefined) {
            userParamString += ` AND (p.title LIKE '%${q}%' OR p.description LIKE '%${q}%')`;
        }
        if (categoryIds !== undefined && categoryIds.length > 0) {
            userParamString += ` AND p.category_id IN (${categoryIds.join(',')})`;
        }
        if (ownerId !== undefined) {
            userParamString += ` AND p.owner_id = ${ownerId}`;
        }
        if (supporterId !== undefined) {
            userParamString += ` AND s.user_id = ${supporterId}`;
        }

        let sortQuery = ' GROUP BY p.id ';

        if (supportingCost === undefined) {
            sortQuery += ''

        } else {
            sortQuery += ` HAVING supportingCost <= ${supportingCost}`;
        }
        Logger.info('blah blahblah!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')


        sortQuery += ' ';

        switch (sortBy) {
            case 'ALPHABETICAL_ASC':
                sortQuery += ' ORDER BY p.title ASC, p.id ASC';
                break;
            case 'ALPHABETICAL_DESC':
                sortQuery += ' ORDER BY p.title DESC, p.id ASC';
                break;
            case 'COST_ASC':
                sortQuery += ' ORDER BY supportingCost ASC, p.id ASC';
                break;
            case 'COST_DESC':
                sortQuery += ' ORDER BY supportingCost DESC, p.id ASC';
                break;
            case 'CREATED_DESC':
                sortQuery += ' ORDER BY p.creation_date DESC, p.id ASC';
                break;
            default:
                sortQuery += ' ORDER BY p.creation_date ASC, p.id ASC';
                break;
        }
        const FinalQuery = mainQuery + userParamString + sortQuery

        const petitionResult = await petitions.fetchAllPetitionsFromDB(FinalQuery);
        const petitionCount = petitionResult.length;
        let ress = null;

        if (startIndex !== undefined) {
            ress = [];
            let startI = parseInt(startIndex, 10);

            for (let i = parseInt(count, 10); i > 0 && startI < petitionCount; i--) {
                ress.push(petitionResult[startI]);
                startI++;
            }
        } else {
            ress = petitionResult;
        }

        res.status(200).send({"petitions": ress, "count": petitionCount});
        return;
    } catch (err) {
        Logger.error(err); // Assuming Logger is defined elsewhere
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
        return;
    }
}





const getPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.statusMessage = "Invalid petition ID";
            res.status(400).send();
            return;
        }
        const exists = await petitions.petitionExists(petitionId);
        if (!exists) {
            res.status(404).json({ message: "Petition not found" });
            return;
        }

        const petition = await petitions.getOne(petitionId);
        const supportTiers = await petitions.getSupportTiers(petitionId);

        if (petition !== null) {
            res.status(200).json({
                petitionId: petition.petitionId,
                title: petition.title,
                categoryId: petition.categoryId,
                ownerId: petition.ownerId,
                ownerFirstName: petition.ownerFirstName,
                ownerLastName: petition.ownerLastName,
                numberOfSupporters: petition.numberOfSupporters,
                creationDate: petition.creationDate,
                description: petition.description,
                moneyRaised: petition.moneyRaised,
                supportTiers
            });
            return;
        } else {
            res.status(404).json({ message: "Petition not found" });
            return;
        }
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
    }
}

const addPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = await validate(schemas.petition_post, req.body);
        if (validation !== true) {
            res.status(400).send(`Bad Request ${validation.toString()}`);
            return;
        }
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            Logger.info('Unauthorized: Missing authentication token');
            res.status(401).send('Unauthorized: Missing authentication token');
            return;
        }

        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            Logger.info(`User ID: ${userId}`);
            res.status(401).send('Unauthorized: Invalid authentication token');
            return;
        }

        const { title, description, categoryId, supportTiers } = req.body;
        const categoryExistsResult = await petitions.categoryExists(categoryId);
        if (!categoryExistsResult) {
            Logger.info('Bad Request: categoryId must reference an existing category');
            res.status(400).send('Bad Request: categoryId must reference an existing category');
            return;
        }
        if (supportTiers.length < 1 || supportTiers.length > 3) {
            res.status(400).send('Bad Request: A petition must have between 1 and 3 support tiers');
            return;
        }
        const uniqueTitles = new Set();
        for (const tier of supportTiers) {
            if (uniqueTitles.has(tier.title)) {
                res.status(400).send('Bad Request: Each support tier title must be unique');
                return;
            }
            uniqueTitles.add(tier.title);
        }

        const petitionId = await petitions.insertPetition(title, description, categoryId, userId, supportTiers);
        res.status(201).send({ message: 'Petition successfully added', petitionId });
        return;
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
        return;
    }
}

const editPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const validation = await validate(schemas.petition_patch, req.body);
        if (validation !== true) {
            res.status(400).send(`Bad Request: ${validation.toString()}`);
            return;
        }
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

        // Check if the user is the owner of the petition
        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.status(403).send('Forbidden: Only the owner of a petition may change it');
            return;
        }



        const { title, description, cost } = req.body;
        Logger.info(title, description, cost);
        await petitions.updatePetition(petitionId, title, description, parseFloat(cost));

        res.status(200).send('Petition successfully updated');
        return;
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
        return;
    }
}

const deletePetition = async (req: Request, res: Response): Promise<void> => {
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

        // Check if the user is the owner of the petition
        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.status(403).send('Forbidden: Only the owner of a petition may delete it');
            return;
        }

        const hasSupporters = await petitions.hasSupporters(petitionId);
        if (hasSupporters) {
            res.status(403).send('Forbidden: Cannot delete a petition with one or more supporters');
            return;
        }

        // Delete the petition
        await petitions.removePetition(petitionId);

        res.status(200).send("petition deleted");
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
        res.status(500).send();
    }
}

const getCategories = async(req: Request, res: Response): Promise<void> => {
    try {
        const categories = await petitions.getAllCategories();

        if (categories.length > 0) {
            res.status(200).json(categories);
            return;
        } else {
            res.status(404).json({ message: "No categories found" });
            return;
        }
    } catch (err) {
        Logger.error(err);
        res.statusMessage = "Internal Server Error";
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

export {getAllPetitions, getPetition, addPetition, editPetition, deletePetition, getCategories};