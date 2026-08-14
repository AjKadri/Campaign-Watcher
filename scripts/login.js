import "dotenv/config";

import { createAuthenticatedSession } from "../services/auth.js";

const success = await createAuthenticatedSession();

process.exit(success ? 0 : 1);

console.log(`[AUTH] Session saved to ${storagePath}`);