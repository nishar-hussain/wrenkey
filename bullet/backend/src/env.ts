import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.loadEnvFile(path.resolve(__dirname, "..", "..", ".env"));
