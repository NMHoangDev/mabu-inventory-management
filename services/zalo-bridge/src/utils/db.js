import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'chatwoot-postgres',
  port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
  user: process.env.POSTGRES_USERNAME || 'postgres',
  password: process.env.POSTGRES_PASSWORD || 'Thuong89@',
  database: process.env.POSTGRES_DATABASE || 'chatwoot',
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle Chatwoot Postgres client', { err: err.message });
});

export async function updateMessageSourceId(messageId, sourceId) {
  try {
    const res = await pool.query(
      'UPDATE messages SET source_id = $1 WHERE id = $2',
      [String(sourceId), parseInt(messageId, 10)]
    );
    if (res.rowCount > 0) {
      logger.info(`Successfully updated source_id to ${sourceId} for message ${messageId} in database.`);
      return true;
    } else {
      logger.warn(`Message ${messageId} not found in database, could not update source_id.`);
      return false;
    }
  } catch (err) {
    logger.error(`Error updating source_id for message ${messageId} in database`, { err: err.message });
    return false;
  }
}

export async function getMessageSourceId(messageId) {
  try {
    const res = await pool.query(
      'SELECT source_id FROM messages WHERE id = $1',
      [parseInt(messageId, 10)]
    );
    if (res.rows.length > 0) {
      return res.rows[0].source_id || null;
    }
    return null;
  } catch (err) {
    logger.error(`Error querying source_id for message ${messageId} in database`, { err: err.message });
    return null;
  }
}
