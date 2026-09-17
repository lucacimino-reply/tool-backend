import type { Pool } from 'pg';

import type { Promotion } from './quote.types.js';

export async function findActivePromotion(pool: Pool, codeIdentity: string): Promise<Promotion | undefined> {
  const result = await pool.query<Promotion>(
    `SELECT code, amount_cents AS "amountCents"
     FROM promotions
     WHERE code_identity = $1 AND active = TRUE`,
    [codeIdentity],
  );
  return result.rows[0];
}
