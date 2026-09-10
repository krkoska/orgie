// uuid@13 ships ESM-only, which Jest's CommonJS runtime can't `require()` directly.
// eventController.ts only calls v4() lazily inside request handlers unrelated to the
// code under test here, so a tiny CJS-safe stand-in is enough for tests to load it.
import { randomUUID } from 'crypto';

export const v4 = (): string => randomUUID();
