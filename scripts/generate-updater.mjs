import fs from 'fs';
import path from 'path';

const VERSION = process.env.VERSION;
const TAG_NAME = process.env.TAG_NAME;
const REPO = 'HyperNebula/TODOer';

function getSignature(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8').trim();
    } catch (e) {
        return null;
    }
}

function generateUpdater(isPlus) {
    const prefix = isPlus ? 'todoer-plus' : 'todoer';
    const platforms = {};
    
    // Windows
    const winDir = `artifacts/${prefix}-windows-latest/src-tauri/target/release/bundle/nsis`;
    if (fs.existsSync(winDir)) {
        const files = fs.readdirSync(winDir);
        const sigFile = files.find(f => f.endsWith('.nsis.zip.sig'));
        if (sigFile) {
            const baseFile = sigFile.replace('.sig', '');
            platforms['windows-x86_64'] = {
                signature: getSignature(path.join(winDir, sigFile)),
                url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
            };
        }
    }
    
    // MacOS
    const macDir = `artifacts/${prefix}-macos-latest/src-tauri/target/release/bundle/macos`;
    if (fs.existsSync(macDir)) {
        const files = fs.readdirSync(macDir);
        const sigFile = files.find(f => f.endsWith('.app.tar.gz.sig'));
        if (sigFile) {
            const baseFile = sigFile.replace('.sig', '');
            const sig = getSignature(path.join(macDir, sigFile));
            platforms['darwin-x86_64'] = {
                signature: sig,
                url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
            };
            platforms['darwin-aarch64'] = {
                signature: sig,
                url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
            };
        }
    }
    
    const updater = {
        version: VERSION,
        notes: "Bug fixes and improvements.",
        pub_date: new Date().toISOString(),
        platforms
    };
    
    const outFile = isPlus ? 'updater-plus.json' : 'updater.json';
    fs.writeFileSync(outFile, JSON.stringify(updater, null, 2));
    console.log(`Generated ${outFile}`);
}

generateUpdater(false);
generateUpdater(true);
