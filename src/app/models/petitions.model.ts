import { getPool } from "../../config/db";
import {ResultSetHeader, RowDataPacket} from 'mysql2';
const imageDirectory = './storage/images/';
import Logger from "../../config/logger";
import fs from "mz/fs";

const fetchAllPetitionsFromDB = async (query: string):Promise<RowDataPacket> => {
    const conn = await getPool().getConnection();
    const [ petitionResults ] = await conn.query( query )
    await conn.release();
    return petitionResults;
}
const petitionExists = async (petitionId: number): Promise<boolean> => {
    const query = `SELECT 1 FROM petition WHERE id = ? LIMIT 1`;
    const [rows] = await getPool().query(query, petitionId);
    return rows.length > 0;
};
const getOne = async (id: number): Promise<any> => {
    const query = `SELECT
        p.id AS petitionId,
        p.title,
        p.category_id AS categoryId,
        p.owner_id AS ownerId,
        u.first_name AS ownerFirstName,
        u.last_name AS ownerLastName,
        (SELECT COUNT(*) FROM supporter WHERE petition_id = p.id) AS numberOfSupporters,
        p.creation_date AS creationDate,
        p.description,
        SUM(st.cost) AS moneyRaised
    FROM
        petition p
    JOIN
        category c ON p.category_id = c.id
    JOIN
        user u ON p.owner_id = u.id
    LEFT JOIN
        supporter s ON p.id = s.petition_id
    LEFT JOIN
        support_tier st ON s.support_tier_id = st.id
    WHERE
        p.id = ?`;
    const [rows] = await getPool().query(query, id);
    if (rows.length === 0) {
        return null;
    }
    return rows[0]; // Assuming you expect only one row as a result
}
const getSupportTiers = async (petitionId: number): Promise<SupportTier[]> => {
    const query = `
        SELECT
            st.title,
            st.description,
            st.cost,
            st.id AS supportTierId
        FROM
            support_tier st
        WHERE
            st.petition_id = ?;
    `;

    const [rows] = await getPool().query(query, petitionId);
    const supportTiers: SupportTier[] = rows.map((row: any) => ({
        title: row.title,
        description: row.description,
        cost: row.cost,
        supportTierId: row.supportTierId
    }));

    return supportTiers;
}
const categoryExists = async (categoryId: number): Promise<boolean> => {
    const query = `SELECT COUNT(*) AS count FROM category WHERE id = ?`;
    const [rows] = await getPool().query(query, categoryId);
    return rows[0].count > 0;
}
const categoryExists2 = async (categoryId: string): Promise<boolean> => {
    const query = `SELECT COUNT(*) AS count FROM category WHERE id = ?`;
    const [rows] = await getPool().query(query, categoryId);
    return rows[0].count > 0;
}

// Function to check if a title exists
const titleExistsInPetition = async (petitionId: number, title: string): Promise<boolean> => {
    const query = `SELECT COUNT(*) AS count FROM support_tier WHERE petition_id = ? AND title = ?`;
    const [rows] = await getPool().query(query, [petitionId, title]);
    return rows[0].count > 0;
};

const titleExistsInDB = async (title: string): Promise<boolean> => {
    const conn = await getPool().getConnection();
    const query = 'SELECT COUNT(*) AS count FROM `petition` WHERE title = ?';
    const [rows] = await conn.query(query, [title]);
    conn.release();
    return rows[0].count > 0; // Return true if count is greater than 0, indicating title exists
}

// Function to insert a new petition into the database
const insertPetition = async (title: string, description: string, categoryId: number, ownerId: number, supportTiers: any[]): Promise<number> => {
    const conn = await getPool().getConnection();
    try {
        await conn.beginTransaction();
        const creationDate = new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Insert petition
        const insertPetitionQuery = `INSERT INTO petition (title, description, category_id, owner_id, creation_date) VALUES (?, ?, ?, ?, ?)`;
        const [insertPetitionResult] = await conn.query(insertPetitionQuery, [title, description, categoryId, ownerId, creationDate]);
        const petitionId = insertPetitionResult.insertId;

        // Insert support tiers
        const insertSupportTierQuery = `INSERT INTO support_tier (title, description, cost, petition_id) VALUES (?, ?, ?, ?)`;
        for (const tier of supportTiers) {
            await conn.query(insertSupportTierQuery, [tier.title, tier.description, tier.cost, petitionId]);
        }

        await conn.commit();
        return petitionId;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}
const getUserIdFromAuthToken = async (authToken: string | string[]): Promise<number | null> => {
        const query = 'SELECT id FROM user WHERE auth_token = ?';
        const [rows] = await getPool().query(query, authToken);
        if (rows && rows.length > 0) {
            // Extract the user ID from the query result
            const userId = rows[0].id;
            return userId;
        } else {
            // No user found with the given auth token
            return null;
        }
};
const isPetitionOwner = async (petitionId: number, userId: number): Promise<boolean> => {
    const conn = await getPool().getConnection();
    const [rows] = await conn.query('SELECT owner_id FROM petition WHERE id = ?', [petitionId]);
    conn.release(); // Release the connection after executing the query
    if (rows.length === 0) {
        // Petition not found
        return false;
    }
    const ownerId = rows[0].owner_id;
    return ownerId === userId;
}

const updatePetition = async (petitionId: number, newTitle: string, newDescription: string, newCost: number): Promise<void> => {
    const query = `
        UPDATE petition
        SET title=?, description=?, cost=?
        WHERE id=?
    `;
    await getPool().query(query, [newTitle, newDescription, newCost, petitionId]);
}
const hasSupporters = async (petitionId: number): Promise<boolean> => {
    const query = `
        SELECT COUNT(*) AS supporterCount
        FROM supporter s
        JOIN support_tier st ON s.support_tier_id = st.id
        WHERE st.petition_id = ?
    `;
    const [rows] = await getPool().query(query, petitionId);
    const supporterCount = rows[0].supporterCount;
    return supporterCount > 0;
}
const removePetition = async (petitionId: number): Promise<void> => {
    const conn = await getPool().getConnection();
    await conn.beginTransaction();
    const deleteQuery = `
        DELETE FROM petition
        WHERE id = ?
    `;
    await conn.query(deleteQuery, [petitionId]);

    await conn.commit();

    conn.release();
}

const getAllCategories = async (): Promise<RowDataPacket[]> => {
    const conn = await getPool().getConnection();
    const [rows] = await conn.query('SELECT * FROM category');
    await conn.release();
    return rows;
};
const supporterExistsForTier = async (tierId: number): Promise<boolean> => {
    const query = `SELECT COUNT(*) AS count FROM supporter WHERE support_tier_id = ?`;
    const [rows] = await getPool().query(query, tierId);
    return rows[0].count > 0;
};
const updateSupportTierTitle = async (tierId: number, title: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = `UPDATE support_tier SET title = ? WHERE id = ?`;
    await conn.query(query, [title, tierId]);
    await conn.release();
};

const updateSupportTierDescription = async (tierId: number, description: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = `UPDATE support_tier SET description = ? WHERE id = ?`;
    await conn.query(query, [description, tierId]);
    await conn.release();
};

const updateSupportTierCost = async (tierId: number, cost: number): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = `UPDATE support_tier SET cost = ? WHERE id = ?`;
    await conn.query(query, [cost, tierId]);
    await conn.release();
};
const insertSupportTier = async (petitionId: number, title: string, description: string, cost: number): Promise<void> => {
    const conn = await getPool().getConnection();
    await conn.beginTransaction();
    const insertQuery = `INSERT INTO support_tier (title, description, cost, petition_id) VALUES (?, ?, ?, ?)`;
    await conn.query(insertQuery, [title, description, cost, petitionId]);
    conn.release();
};
const removeSupportTier = async (tierId: number): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = `DELETE FROM support_tier WHERE id = ?`;
    await conn.query(query, [tierId]);
    conn.release();
};
const supportTierExists = async (tierId: number): Promise<boolean> => {
    const query = `SELECT COUNT(*) AS count FROM support_tier WHERE id = ?`;
    const [rows] = await getPool().query(query, tierId);
    Logger.info(rows);
    return rows.length > 0 && rows[0].count > 0;
};

const getSupportersFromDatabase = async (petitionId: number): Promise<Supporter[]> => {
    const query = `
    SELECT s.id AS supportId, s.support_tier_id AS supportTierId, s.message,
           u.id AS supporterId, u.first_name AS supporterFirstName, u.last_name AS supporterLastName,
           s.timestamp
    FROM supporter s
    INNER JOIN user u ON s.user_id = u.id
    WHERE s.petition_id = ?
    ORDER BY s.timestamp DESC`;
    const [rows] = await getPool().query(query, [petitionId]);
    return rows;
};

const addSupporterToDb = async (petitionId: number, supporterId: number, supportTierId: number, message: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'INSERT INTO `supporter` (`petition_id`, `user_id`, `support_tier_id`, `message`) VALUES (?, ?, ?, ?)'
    const parameters = [petitionId, supporterId, supportTierId, message];
    await conn.query(query, parameters);
    conn.release();
};



const getSupportTierId = async (petitionId: number, userId: number): Promise<number | null> => {
    const query = `SELECT support_tier_id FROM supporter WHERE petition_id = ? AND user_id = ?`;
    const [rows] = await getPool().query(query, [petitionId, userId]);
    if (rows.length > 0) {
        return rows[0].support_tier_id;
    } else {
        return null;
    }
};
const isUserOwnerOfPetition = async (userId: number, petitionId: number): Promise<boolean> => {
    const query = `SELECT owner_id FROM petition WHERE id = ?`;
    const [rows] = await getPool().query(query, petitionId);
    if (rows.length > 0) {
        const ownerId = rows[0].owner_id;
        return userId === ownerId;
    }
    return false; // Return false if the petition doesn't exist or if there's no owner associated with it
};
const getImageFilename = async (id: number): Promise<string> => {
    const query = 'SELECT `image_filename` FROM `petition` WHERE id = ?';
    const rows = await getPool().query(query, [id]);
    return rows[0].length === 0 ? null : rows[0][0].image_filename;
}
const updatePetitionsHeroPic = async (petitionId: number, filename: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `petition` SET image_filename = ? WHERE Id = ?';
    const parameters = [filename, petitionId];
    await conn.query(query, parameters);
    await conn.release();
};
const updateCategory = async (petitionId: number, categoryId: number): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `petition` SET `category_id` = ? WHERE `id` = ?';
    await conn.query(query, [categoryId, petitionId]);
    conn.release();
};

// Function to update the description of a petition
const updatePetitionDescription = async (petitionId: number, description: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = 'UPDATE `petition` SET `description` = ? WHERE `id` = ?';
    await conn.query(query, [description, petitionId]);
    conn.release();
};

// Function to check if a title exists in another petition
const updateTitle = async (petitionId: number, title: string): Promise<void> => {
    const conn = await getPool().getConnection();
    const query = ' update petition set title = ? where id = ?';
    const [ result ] = await conn.query( query, [ title , petitionId ] );
    await conn.release();
}
const hasUserSupportedTier = async (userId: number, petitionId: number, supportTierId: number): Promise<boolean> => {
    const query = 'SELECT COUNT(*) AS count FROM supporter WHERE user_id = ? AND petition_id = ? AND support_tier_id = ?';
    const [rows] = await getPool().query(query, [userId, petitionId, supportTierId]);
    return rows[0].count > 0;
};
const removeImage = async (filename: string): Promise<void> => {
    if(filename) {
        if (await fs.exists(imageDirectory + filename)) {
            await fs.unlink(imageDirectory + filename);
        }
    }
}









export {categoryExists2,titleExistsInDB,
    removeImage,hasUserSupportedTier,updatePetitionsHeroPic,getImageFilename, getSupportTierId
    ,addSupporterToDb,isUserOwnerOfPetition, getSupportersFromDatabase, supportTierExists,removeSupportTier,titleExistsInPetition
    ,insertSupportTier, updateSupportTierCost, updateSupportTierTitle, updateSupportTierDescription,supporterExistsForTier,hasSupporters,getAllCategories
    , petitionExists, removePetition, updateTitle, updateCategory, updatePetitionDescription,
    fetchAllPetitionsFromDB, getOne, getSupportTiers, categoryExists, insertPetition,getUserIdFromAuthToken, isPetitionOwner, updatePetition};