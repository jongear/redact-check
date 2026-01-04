import * as matchers from '@testing-library/jest-dom/matchers';
import { expect } from 'vitest';

// Extend the global expect (from globals: true in vitest.config.ts)
expect.extend(matchers);
