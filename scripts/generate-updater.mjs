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

function findSigFiles(dir) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(findSigFiles(file));
        } else if (file.endsWith('.sig')) {
            results.push(file);
        }
    });
    return results;
}

function generateUpdater(isPlus) {
    const prefix = isPlus ? 'todoer-plus' : 'todoer';
    const platforms = {};
    
    // Windows
    const winDir = `artifacts/${prefix}-windows-latest`;
    const winSigs = findSigFiles(winDir).filter(f => f.endsWith('.nsis.zip.sig'));
    if (winSigs.length > 0) {
        const sigFile = winSigs[0];
        const baseFile = path.basename(sigFile).replace('.sig', '');
        platforms['windows-x86_64'] = {
            signature: getSignature(sigFile),
            url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
        };
    }
    
    // MacOS
    const macDir = `artifacts/${prefix}-macos-latest`;
    const macSigs = findSigFiles(macDir).filter(f => f.endsWith('.app.tar.gz.sig'));
    if (macSigs.length > 0) {
        const sigFile = macSigs[0];
        const baseFile = path.basename(sigFile).replace('.sig', '');
        const sig = getSignature(sigFile);
        platforms['darwin-x86_64'] = {
            signature: sig,
            url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
        };
        platforms['darwin-aarch64'] = {
            signature: sig,
            url: `https://github.com/${REPO}/releases/download/${TAG_NAME}/${baseFile}`
        };
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
