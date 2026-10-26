// Application-level guard. Database operators / raw collection access require
// separate least-privilege controls; these hooks are not database WORM storage.
export function appendOnly(schema) {
  const denied = () => new Error('Monetary events are append-only.');
  for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'bulkWrite']) {
    schema.pre(operation, function (next) { next(denied()); });
  }
  schema.pre('deleteOne', { document: true, query: false }, function (next) { next(denied()); });
  schema.pre('save', function (next) {
    if (!this.isNew || !this.$session()?.inTransaction()) return next(denied());
    next();
  });
  schema.pre('insertMany', function (next, _documents, options) {
    if (!options?.session?.inTransaction()) return next(denied());
    next();
  });
}
