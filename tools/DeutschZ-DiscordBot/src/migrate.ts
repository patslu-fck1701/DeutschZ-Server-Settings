import { Database } from './database.js';

const db = await Database.open();
console.log('Datenbankmigration erfolgreich.');
db.close();
