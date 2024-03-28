import {query, Request, Response} from "express";
import Logger from '../../config/logger';

import Ajv from "ajv";
import * as schemas from '../resources/schemas.json'
import * as petitions from '../models/petitions.model'
import {categoryExists} from "../models/petitions.model";
import logger from "../../config/logger";
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
        const startIdx = req.query.startIndex as string;
        const requestCount = req.query.count as string;
        const searchText = req.query.q as string;
        const requestedOwnerId = req.query.ownerId as string;
        const requestedSupporterId = req.query.supporterId as string;
        const sortBy = req.query.sortBy as string;

        if (requestedSupporterId && isNaN(Number(requestedSupporterId))) {
            res.statusMessage = "Bad Request: supporterId must be a number"
            res.status(400).send()
            return;
        }

        const mainQuery = 'SELECT p.id AS petitionId, p.title AS title, p.category_id AS categoryId, p.owner_id AS ownerId, ' +
            'u.first_name AS ownerFirstName, u.last_name AS ownerLastName, ' +
            'p.creation_date as creationDate, MIN(st.cost) as supportingCost, ' +
            '(SELECT COUNT(*) FROM supporter WHERE petition_id = p.id) AS numberOfSupporters ' +
            'FROM petition p JOIN user u ON p.owner_id = u.id ' +
            'LEFT JOIN supporter s ON p.id = s.petition_id ' +
            'JOIN support_tier st ON p.id = st.petition_id ';

        let userParamString = 'WHERE 1=1';

        if (searchText !== undefined) {
            userParamString += ` AND (p.title LIKE '%${searchText}%' OR p.description LIKE '%${searchText}%')`;
        }
        if (categoryIds !== undefined && categoryIds.length > 0) {
            if(categoryIds.length > 1) {
                for(const categoryId of categoryIds) {
                    const checkCategory=await petitions.categoryExists2(categoryId);
                    if (checkCategory === false) {
                        res.statusMessage = "bad Request";
                        res.status(400).send();
                        return;
                    }
                }
                userParamString += ` AND p.category_id IN (${categoryIds.join(',')})`;
            } else {
                for (const categoryId of categoryIds) {
                    const checkCategory = await petitions.categoryExists2(categoryId);
                    if (checkCategory === false) {
                        res.statusMessage = "bad Request";
                        res.status(400).send();
                        return;
                    }
                }
                userParamString += ` AND p.category_id IN (${categoryIds})`;
            }
        }
        if (requestedOwnerId !== undefined) {
            userParamString += ` AND p.owner_id = ${requestedOwnerId}`;
        }
        if (requestedSupporterId !== undefined) {
            userParamString += ` AND s.user_id = ${requestedSupporterId}`;
        }

        let sortQuery = ' GROUP BY p.id ';

        if (supportingCost === undefined) {
            sortQuery += '';
        } else {
            sortQuery += ` HAVING supportingCost <= ${supportingCost}`;
        }

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
        const FinalQuery = mainQuery + userParamString + sortQuery;

        const petitionResult = await petitions.fetchAllPetitionsFromDB(FinalQuery);
        const petitionCount = petitionResult.length;
        let response = null;

        if (startIdx !== undefined) {
            response = [];
            let startIndex = parseInt(startIdx, 10);

            for (let i = parseInt(requestCount, 10); i > 0 && startIndex < petitionCount; i--) {
                response.push(petitionResult[startIndex]);
                startIndex++;
            }
        } else {
            response = petitionResult;
        }

        res.status(200).send({ "petitions": response, "count": petitionCount });
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
            res.statusMessage = "Petition not found"
            res.status(404).send();
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
                moneyRaised: parseInt(petition.moneyRaised,10),
                supportTiers
            });
            return;
        } else {
            res.statusMessage = "Petition not found"
            res.status(404).send()
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
            res.statusMessage = "Bad Request";
            res.status(400).send();
            return;
        }
        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            Logger.info('Unauthorized: Missing authentication token');
            res.statusMessage = 'Unauthorized: Missing authentication token';
            res.status(401).send();
            return;
        }

        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            Logger.info(`User ID: ${userId}`);
            res.statusMessage = 'Unauthorized: Invalid authentication token';
            res.status(401).send();
            return;
        }

        const { title, description, categoryId, supportTiers } = req.body;
        const categoryExistsResult = await petitions.categoryExists(categoryId);
        if (!categoryExistsResult) {
            Logger.info('Bad Request: categoryId must reference an existing category');
            res.statusMessage = 'Bad Request: categoryId must reference an existing category';
            res.status(400).send();
            return;
        }
        if (supportTiers.length < 1 || supportTiers.length > 3) {
            res.statusMessage = 'Bad Request: A petition must have between 1 and 3 support tiers';
            res.status(400).send();
            return;
        }
        const uniqueTitles = new Set();
        for (const tier of supportTiers) {
            if (uniqueTitles.has(tier.title)) {
                res.statusMessage = 'Bad Request: Each support tier title must be unique';
                res.status(400).send();
                return;
            }
            uniqueTitles.add(tier.title);
        }

        const petitionId = await petitions.insertPetition(title, description, categoryId, userId, supportTiers);
        res.status(201).send( {petitionId} );
        return;
    } catch (err) {
        Logger.error(err);
        res.statusMessage = 'Internal Server Error';
        res.status(500).send();
        return;
    }
}

const editPetition = async (req: Request, res: Response): Promise<void> => {
    try {
        const { title, description, categoryId } = req.body;
        const validation = await validate(schemas.petition_patch, req.body);
        if (validation !== true) {
            res.statusMessage = "Bad Request";
            res.status(400).send();
            return;
        }
        const petitionId = parseInt(req.params.id, 10);
        if (isNaN(petitionId)) {
            res.statusMessage = 'Bad Request: Invalid petition ID';
            res.status(400).send();
            return;
        }

        const authToken = req.headers['x-authorization'];
        if (!authToken) {
            res.statusMessage = 'Unauthorized: Missing authentication token';
            res.status(401).send();
            return;
        }

        const userId = await petitions.getUserIdFromAuthToken(authToken);
        if (!userId) {
            res.statusMessage = 'Unauthorized: Invalid authentication token'
            res.status(401).send();
            return;
        }

        const isOwner = await petitions.isPetitionOwner(petitionId, userId);
        if (!isOwner) {
            res.statusMessage = 'Forbidden: Only the owner of a petition may change it'
            res.status(403).send();
            return;
        }


logger.info("I get here")

        if (title !== undefined) {
            const petitonTitleExists = await petitions.titleExistsInDB(title)
            logger.info(petitonTitleExists)

            if (petitonTitleExists) {
                res.statusMessage = "Bad Request: Title";
                res.status(403).send();
                return ;
            }
            await petitions.updateTitle(petitionId, title);
        }

        if (description !== undefined) {
            await petitions.updatePetitionDescription(petitionId, description);
        }

        if (categoryId !== undefined) {
            const catExists = await petitions.categoryExists(categoryId);
            if (!catExists) {
                res.statusMessage = 'Bad Request'
                res.status(403).send();
            }
            await petitions.updateCategory(petitionId, categoryId);
        }
        res.statusMessage = "Petition successfully updated"

        res.status(200).send();
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
            res.statusMessage = 'Bad Request: Invalid petition ID';
            res.status(400).send();
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