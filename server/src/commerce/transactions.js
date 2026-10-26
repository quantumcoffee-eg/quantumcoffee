import { CommerceError } from './checkout.js';

export const TRANSACTION_ATTEMPTS = 3;
export const TRANSACTION_TIMEOUT_MS = 15000;
export const hasErrorLabel = (error, label) => Boolean(error?.hasErrorLabel?.(label) || error?.errorLabels?.includes(label));
export function databaseCommerceError(error, bodyCompleted = false) {
  if (error instanceof CommerceError) return error;
  if (hasErrorLabel(error, 'UnknownTransactionCommitResult') || (bodyCompleted && error?.name === 'MongoOperationTimeoutError')) return new CommerceError('The database could not confirm the result. Refresh the order, or retry checkout with the same reference.', 'TRANSACTION_UNCERTAIN', 503);
  if (hasErrorLabel(error, 'TransientTransactionError') || [112, 251, 91, 11600, 11602].includes(error?.code) || /^Mongo(?:Network|ServerSelection|OperationTimeout)/.test(error?.name || '')) return new CommerceError('The database is temporarily busy. Refresh and retry with the same reference.', 'DATABASE_BUSY', 503);
  if (error?.code !== 11000 && (['ValidationError','StrictModeError'].includes(error?.name) || /^Mongo/.test(error?.name || ''))) return new CommerceError('The database rejected the operation. Refresh the order before trying again.', 'DATABASE_WRITE_FAILED', 503);
  return error;
}
export async function commerceTransaction(connection, callback) {
  let attempts = 0, bodyCompleted = false;
  try {
    // Installed driver CSOT bounds body + commit retries. Mongoose retains its
    // document rollback handling; the driver retries uncertain commits only.
    return await connection.transaction(async session => {
      if (++attempts > TRANSACTION_ATTEMPTS) throw new CommerceError('Concurrent inventory changes prevented this operation. Refresh and retry.', 'DATABASE_BUSY', 503);
      bodyCompleted = false;
      const result = await callback(session);
      bodyCompleted = true;
      return result;
    }, { timeoutMS: TRANSACTION_TIMEOUT_MS, maxCommitTimeMS: 5000, readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary' });
  } catch (error) { throw databaseCommerceError(error, bodyCompleted); }
}
