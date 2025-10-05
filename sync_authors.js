const fs = require('fs');
const https = require('https');
const zlib = require('zlib');
const path = require('path');

async function downloadAndExtractRepoJson() {
    const url = 'https://raw.githubusercontent.com/babalae/bettergi-scripts-list/refs/heads/release/repo.json.gz';
    
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    const decompressed = zlib.gunzipSync(buffer);
                    const jsonData = JSON.parse(decompressed.toString());
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', reject);
    });
}

function collectAuthorsFromNode(node, currentPath = '') {
    const authors = new Set();
    const pathAuthors = new Map();

    // 构建当前路径
    const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;

    // 如果是文件节点，收集作者信息
    if (node.type === 'file' && node.authors) {
        const authorLinks = node.authors
            .filter(author => author.link && author.link.trim())
            .map(author => author.link);
        
        if (authorLinks.length > 0) {
            pathAuthors.set(nodePath, authorLinks);
        } else {
            // 有路径但没有有效作者链接的情况
            pathAuthors.set(nodePath, []);
        }
    }

    // 递归处理子节点
    if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
            const childResults = collectAuthorsFromNode(child, nodePath);
            
            // 合并子节点的作者
            for (const [path, authors] of childResults.pathAuthors) {
                pathAuthors.set(path, authors);
            }
        }
    }

    return { pathAuthors };
}

function buildAuthorMapping(repoData) {
    const pathAuthors = new Map();

    // 处理 indexes 数组中的每个节点
    if (repoData.indexes && Array.isArray(repoData.indexes)) {
        for (const indexNode of repoData.indexes) {
            const results = collectAuthorsFromNode(indexNode);
            
            // 合并结果
            for (const [path, authors] of results.pathAuthors) {
                pathAuthors.set(path, authors);
            }
        }
    }

    // 转换为 author_mapping.json 格式
    const authorMapping = Array.from(pathAuthors.entries()).map(([path, authorLinks]) => ({
        path: path,
        authorLinks: authorLinks
    }));

    return authorMapping;
}

async function syncAuthors() {
    try {
        console.log('开始同步作者信息...');
        
        // 下载并解压 repo.json.gz
        console.log('正在下载 repo.json.gz...');
        const repoData = await downloadAndExtractRepoJson();
        console.log('下载完成，开始解析数据...');

        // 构建作者映射
        const authorMapping = buildAuthorMapping(repoData);
        console.log(`解析完成，共找到 ${authorMapping.length} 个路径`);

        // 写入 author_mapping.json
        const outputPath = 'author_mapping.json';
        fs.writeFileSync(outputPath, JSON.stringify(authorMapping, null, 2), 'utf8');
        console.log(`作者映射已更新到 ${outputPath}`);

        // 输出统计信息
        const pathsWithAuthors = authorMapping.filter(item => item.authorLinks.length > 0).length;
        const pathsWithoutAuthors = authorMapping.length - pathsWithAuthors;
        
        console.log(`统计信息:`);
        console.log(`- 有作者的路径: ${pathsWithAuthors}`);
        console.log(`- 无作者的路径: ${pathsWithoutAuthors}`);
        console.log(`- 总路径数: ${authorMapping.length}`);

    } catch (error) {
        console.error('同步失败:', error.message);
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    syncAuthors();
}

module.exports = { syncAuthors, downloadAndExtractRepoJson, buildAuthorMapping };
