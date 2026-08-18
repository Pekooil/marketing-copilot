import { z } from "zod";

// PostgreSQL timestamptz JSON values use explicit offsets (for example +00:00),
// while application-generated timestamps commonly use Z. Database response
// contracts must accept both representations.
export const databaseTimestampSchema = z.iso.datetime({ offset: true });
