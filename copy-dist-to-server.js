import fs from 'fs-extra';
import path from 'path';

async function copyDistToServer() {
    try {
        const sourceDir = path.join(process.cwd(), 'dist');
        const destDir = path.join(process.cwd(), 'server', 'public');

        // Create destination directory if it doesn't exist
        await fs.ensureDir(destDir);
        
        // Copy files from dist to server/public
        await fs.copy(sourceDir, destDir, { overwrite: true });
        
        console.log('Successfully copied frontend build to server/public');
    } catch (error) {
        console.error('Error copying files:', error);
        process.exit(1);
    }
}

copyDistToServer();
