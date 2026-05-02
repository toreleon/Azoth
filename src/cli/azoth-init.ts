#!/usr/bin/env node
import "../runtime/bootstrap.js";
import { getDb, closeDb } from "../storage/db.js";
import { azothPaths } from "../runtime/paths.js";
import { initializeAzothRuntime } from "../runtime/init.js";

initializeAzothRuntime();
getDb();
closeDb();

const paths = azothPaths();
console.log(`Azoth runtime initialized at ${paths.home}`);
console.log(`Config: ${paths.config}`);
console.log(`Database: ${process.env.VNSTOCK_DB ?? paths.db}`);
