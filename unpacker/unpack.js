import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import RisuPacker from './risum-packer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    if (process.argv.length < 3) {
        console.log('Usage: node unpack.js <input.risum> [output_dir]');
        process.exit(1);
    }

    const risumFilePath = path.resolve(process.argv[2]);
    const outputDir = process.argv[3] 
        ? path.resolve(process.argv[3]) 
        : path.resolve(__dirname, path.basename(risumFilePath, '.risum') + '_unpacked');

    try {
        console.log(`Loading packer...`);
        const packer = await RisuPacker.create('rpack.wasm');

        console.log(`Reading .risum file: ${risumFilePath}`);
        const risumBuffer = await fs.readFile(risumFilePath);
        
        console.log('Unpacking .risum file...');
        const { module, assets } = await packer.unpack(risumBuffer);

        await fs.mkdir(outputDir, { recursive: true });
        
        // module.json 저장
        const moduleJsonPath = path.join(outputDir, 'module.json');
        await fs.writeFile(moduleJsonPath, JSON.stringify(module, null, 2));
        console.log(`Saved module.json to: ${moduleJsonPath}`);

        // Assets 저장
        if (assets.length > 0) {
            console.log(`Saving ${assets.length} assets...`);
            for (let i = 0; i < assets.length; i++) {
                const assetInfo = module.assets?.[i];
                const extension = assetInfo?.[2] || 'bin';
                const assetPath = path.join(outputDir, `asset_${i}.${extension}`);
                await fs.writeFile(assetPath, assets[i]);
                console.log(`Saved asset ${i} to: ${assetPath}`);
            }
        }

        console.log('Unpacking successful.');

    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

main();
