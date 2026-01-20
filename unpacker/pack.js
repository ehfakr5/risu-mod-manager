import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import RisuPacker from './risum-packer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    if (process.argv.length < 3) {
        console.log('Usage: node pack.js <input_dir> [output.risum]');
        process.exit(1);
    }

    const inputDir = path.resolve(process.argv[2]);
    const outputFilePath = process.argv[3]
        ? path.resolve(process.argv[3])
        : path.resolve(__dirname, path.basename(inputDir).replace('_unpacked', '') + '.repacked.risum');

    try {
        console.log(`Loading packer...`);
        const packer = await RisuPacker.create('rpack.wasm');

        // module.json 읽기
        const moduleJsonPath = path.join(inputDir, 'module.json');
        console.log(`Reading module.json from: ${moduleJsonPath}`);
        const moduleJsonContent = await fs.readFile(moduleJsonPath, 'utf-8');
        const module = JSON.parse(moduleJsonContent);

        // Assets 읽기
        const assets = [];
        if (module.assets && Array.isArray(module.assets)) {
            console.log(`Reading ${module.assets.length} assets...`);
            for (let i = 0; i < module.assets.length; i++) {
                const assetInfo = module.assets[i];
                const extension = assetInfo?.[2] || 'bin';
                const assetPath = path.join(inputDir, `asset_${i}.${extension}`);
                try {
                    const assetData = await fs.readFile(assetPath);
                    assets.push(assetData);
                } catch (e) {
                    console.error(`Error reading asset ${i} at ${assetPath}:`, e.message);
                    throw e;
                }
            }
        }

        console.log('Packing to .risum file...');
        // Pack (rawMainData 없이 module 객체 사용 -> 수정 사항 반영됨)
        const repackedBuffer = await packer.pack({ module, assets });

        await fs.writeFile(outputFilePath, repackedBuffer);
        console.log(`Repacked .risum file saved to: ${outputFilePath}`);

    } catch (error) {
        console.error('An error occurred:', error);
        process.exit(1);
    }
}

main();
