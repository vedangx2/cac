// lib/engine/index.ts
//
// One front door for the engine, so screens import from '@/lib/engine' and never need to
// know which file inside it does what.

export {
  compareToBaseline,
  MissingBaselineError,
  InvalidComparisonError,
  SchemaVersionMismatchError,
} from './compare';
export { buildBreakdown, type ComparisonRow } from './breakdown';
export { resolveComparedBaselineId } from './resolveBaseline';
export * from './thresholds';
